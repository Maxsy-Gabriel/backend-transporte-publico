import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marca a rota como pública: dispensa o JWT (cadastro e login).
 * A API key continua obrigatória: ela vale para TODAS as rotas.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
