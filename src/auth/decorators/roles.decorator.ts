import { SetMetadata } from '@nestjs/common';
import type { Role } from '../../generated/prisma/client.js';

export const ROLES_KEY = 'roles';

/**
 * Restringe a rota (ou o controller inteiro) aos papéis informados; quem tem outro papel
 * recebe 403. Sem @Roles, qualquer usuário autenticado acessa (ex.: "meu perfil").
 */
export const Roles = (...papeis: Role[]) => SetMetadata(ROLES_KEY, papeis);
