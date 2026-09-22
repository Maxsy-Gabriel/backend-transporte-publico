import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '../../generated/prisma/client.js';
import type { AuthenticatedUser } from '../authenticated-user.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';

/**
 * Autorização por papel: confere o papel do usuário autenticado com o @Roles da rota.
 * Roda depois do JwtAuthGuard (que preenche `req.user`).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const alvos = [context.getHandler(), context.getClass()];

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, alvos)) {
      return true;
    }

    const papeis = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, alvos);
    // Sem @Roles: basta estar autenticado (ex.: "meu perfil").
    if (!papeis || papeis.length === 0) return true;

    const usuario = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>().user;
    if (usuario && papeis.includes(usuario.role)) return true;

    throw new ForbiddenException(
      'Você não tem permissão para realizar esta operação.',
    );
  }
}
