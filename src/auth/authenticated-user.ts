import type { Role } from '../generated/prisma/client.js';

/** Identidade autenticada: fica em `req.user` e é entregue pelo decorator @CurrentUser(). */
export interface AuthenticatedUser {
  id: string;
  role: Role;
}
