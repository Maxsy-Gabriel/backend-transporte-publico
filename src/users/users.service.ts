import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import argon2 from 'argon2';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import type { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { Role, RouteStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ChangePasswordDto } from './dto/change-password.dto.js';
import type { CreateUserDto } from './dto/create-user.dto.js';
import type { UpdateMeDto } from './dto/update-me.dto.js';
import type { UpdateUserDto } from './dto/update-user.dto.js';

/**
 * Nenhuma consulta aqui devolve o hash da senha: o PrismaService o omite por padrão
 * (`omit` global). Só o login e a troca de senha o pedem explicitamente.
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // "Meu perfil": sempre recebe o id do TOKEN (via @CurrentUser), nunca da requisição.
  // ---------------------------------------------------------------------------

  perfil(id: string) {
    return this.prisma.user.findUniqueOrThrow({ where: { id } });
  }

  atualizarPerfil(id: string, dto: UpdateMeDto) {
    return this.prisma.user.update({ where: { id }, data: { name: dto.name } });
  }

  async alterarSenha(id: string, dto: ChangePasswordDto): Promise<void> {
    const usuario = await this.prisma.user.findUniqueOrThrow({
      where: { id },
      omit: { passwordHash: false },
    });
    if (!(await argon2.verify(usuario.passwordHash, dto.currentPassword))) {
      throw new BadRequestException('Senha atual incorreta.');
    }
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash: await argon2.hash(dto.newPassword) },
    });
  }

  // ---------------------------------------------------------------------------
  // Administração de usuários (somente ADMIN, garantido no controller).
  // ---------------------------------------------------------------------------

  async criar(dto: CreateUserDto) {
    const existente = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (existente) throw new ConflictException('E-mail já cadastrado.');

    return this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        passwordHash: await argon2.hash(dto.password),
        role: dto.role,
      },
    });
  }

  async listar({ page, limit }: PaginationQueryDto) {
    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        // O id desempata registros criados no mesmo instante: sem ele, a paginação poderia repetir ou pular itens.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count(),
    ]);
    return { data, total, page, limit };
  }

  async buscar(id: string) {
    const usuario = await this.prisma.user.findUnique({ where: { id } });
    if (!usuario) throw new NotFoundException('Usuário não encontrado.');
    return usuario;
  }

  async atualizar(id: string, dto: UpdateUserDto, atual: AuthenticatedUser) {
    // Evita que o último administrador se tranque para fora do sistema.
    const rebaixa = dto.role !== undefined && dto.role !== Role.ADMIN;
    if (id === atual.id && (dto.active === false || rebaixa)) {
      throw new ConflictException(
        'Você não pode desativar nem rebaixar a própria conta.',
      );
    }

    await this.buscar(id); // 404 claro quando o usuário não existe

    // Motorista de rota ativa não perde a conta nem troca de papel: o token é conferido a cada
    // requisição, então com uma viagem em andamento ele ficaria sem acesso com alunos a bordo.
    // (Mesma regra que já vale para o perfil de motorista, em DriversService.atualizar.)
    const desativa = dto.active === false;
    const deixaDeSerMotorista =
      dto.role !== undefined && dto.role !== Role.DRIVER;
    if (desativa || deixaDeSerMotorista) {
      const rotaAtiva = await this.prisma.route.findFirst({
        where: { status: RouteStatus.ACTIVE, driver: { userId: id } },
        select: { name: true },
      });
      if (rotaAtiva) {
        throw new ConflictException(
          `Este usuário é o motorista da rota ativa "${rotaAtiva.name}": desative a rota ou troque o motorista antes.`,
        );
      }
    }

    return this.prisma.user.update({
      where: { id },
      data: { name: dto.name, role: dto.role, active: dto.active },
    });
  }
}
