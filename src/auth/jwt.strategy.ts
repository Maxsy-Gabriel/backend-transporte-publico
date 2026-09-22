import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedUser } from './authenticated-user.js';

/**
 * Validação do JWT (passport-jwt). A assinatura e a expiração são conferidas pela biblioteca;
 * aqui definimos as regras e o que vira `req.user`.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService<EnvironmentVariables, true>,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.getOrThrow('JWT_SECRET', { infer: true }),
      ignoreExpiration: false,
      // Algoritmo fixo: impede ataques que trocam o algoritmo do token (ex.: "none").
      algorithms: ['HS256'],
    });
  }

  /**
   * Roda só para tokens com assinatura válida e não expirados. Consulta o usuário no banco a
   * cada requisição de propósito: assim um usuário desativado, ou com o papel alterado, perde
   * o acesso imediatamente, sem esperar o token expirar. O papel usado vem do BANCO, não do token.
   */
  async validate(payload: { sub: string }): Promise<AuthenticatedUser> {
    const usuario = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, active: true },
    });
    if (!usuario || !usuario.active) throw new UnauthorizedException();
    return { id: usuario.id, role: usuario.role };
  }
}
