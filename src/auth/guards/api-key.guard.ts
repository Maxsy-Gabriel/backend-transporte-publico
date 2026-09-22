import { createHash, timingSafeEqual } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { EnvironmentVariables } from '../../config/env.validation.js';

/** Cabeçalho da chave. O HTTP não diferencia maiúsculas: `X-API-KEY` e `x-api-key` valem. */
export const API_KEY_HEADER = 'x-api-key';

/**
 * Primeira camada de proteção: TODA rota exige a API key no cabeçalho `X-API-KEY`, inclusive
 * login e cadastro. Só depois disso o JWT e os papéis são avaliados.
 *
 * A chave identifica a APLICAÇÃO cliente (não o usuário) e vem do ambiente (API_KEY), com um
 * valor diferente em cada ambiente. Ela não substitui o JWT: é uma camada extra.
 *
 * A comparação usa o hash SHA-256 das duas chaves e `timingSafeEqual` (tempo constante):
 * a resposta não revela quantos caracteres estavam certos nem o tamanho da chave.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly hashEsperado: Buffer;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.hashEsperado = this.hash(
      config.getOrThrow('API_KEY', { infer: true }),
    );
  }

  canActivate(context: ExecutionContext): boolean {
    const chave = context
      .switchToHttp()
      .getRequest<Request>()
      .header(API_KEY_HEADER);

    if (
      typeof chave === 'string' &&
      timingSafeEqual(this.hash(chave), this.hashEsperado)
    ) {
      return true;
    }
    throw new UnauthorizedException('API key ausente ou inválida.');
  }

  private hash(valor: string): Buffer {
    return createHash('sha256').update(valor).digest();
  }
}
