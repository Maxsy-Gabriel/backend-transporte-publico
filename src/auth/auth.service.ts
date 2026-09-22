import { randomBytes } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import argon2 from 'argon2';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { Role } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';

@Injectable()
export class AuthService {
  /**
   * Hash de uma senha aleatória, usado quando o e-mail não existe: o login gasta o mesmo
   * tempo de CPU com usuário inexistente e com senha errada, então o tempo de resposta não
   * revela quais e-mails estão cadastrados.
   */
  private readonly hashFalso = argon2.hash(randomBytes(16).toString('hex'));

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  /** Cadastro público: cria SEMPRE um responsável (GUARDIAN), nunca outro papel. */
  async register(dto: RegisterDto) {
    const existente = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (existente) throw new ConflictException('E-mail já cadastrado.');

    // A senha é guardada só como hash argon2id (o padrão da biblioteca). Se duas requisições
    // passarem pela checagem acima ao mesmo tempo, a constraint única do banco barra a segunda (409).
    return this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        passwordHash: await argon2.hash(dto.password),
        role: Role.GUARDIAN,
      },
    });
  }

  /** Login: confere e-mail e senha e devolve o JWT. Toda falha responde a MESMA mensagem. */
  async login(dto: LoginDto) {
    const usuario = await this.prisma.user.findUnique({
      where: { email: dto.email },
      // O hash da senha é omitido por padrão em todas as consultas; o login é a exceção.
      omit: { passwordHash: false },
    });

    const hash = usuario?.passwordHash ?? (await this.hashFalso);
    const senhaCorreta = await argon2.verify(hash, dto.password);
    if (!usuario || !usuario.active || !senhaCorreta) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    return {
      accessToken: await this.jwt.signAsync({
        sub: usuario.id,
        role: usuario.role,
      }),
      tokenType: 'Bearer',
      expiresIn: this.config.getOrThrow('JWT_EXPIRES_IN', { infer: true }),
    };
  }
}
