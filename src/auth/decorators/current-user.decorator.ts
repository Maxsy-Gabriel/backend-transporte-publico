import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser } from '../authenticated-user.js';

/**
 * Entrega ao handler o usuário autenticado (id e papel), lido do JWT já validado.
 *
 * Operações "do próprio usuário" devem usar SEMPRE este valor, nunca um id vindo do corpo,
 * da query ou da URL: assim ninguém age em nome de outra pessoa trocando um id.
 */
export const CurrentUser = createParamDecorator(
  (_dados: unknown, contexto: ExecutionContext): AuthenticatedUser =>
    contexto.switchToHttp().getRequest<{ user: AuthenticatedUser }>().user,
);
