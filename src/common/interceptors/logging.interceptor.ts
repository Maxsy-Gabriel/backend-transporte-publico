import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';

/**
 * Interceptor de log estruturado e tempo de execução (finalidade documentada, AV-09).
 *
 * Registra UMA linha por requisição que chega a um handler: método, rota-padrão, status
 * final, duração e id do usuário autenticado.
 *
 * Não registra: corpo, cabeçalhos, tokens, query string nem o valor real dos parâmetros
 * (a rota sai como "/students/:id"). Assim o log nunca carrega senhas ou dados pessoais.
 * Também não contém regra de negócio nem altera a resposta.
 *
 * Limite conhecido: interceptors rodam depois dos guards; requisições barradas por
 * autenticação/autorização (401/403) ou rota inexistente (404) não passam por aqui.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request & { user?: { id?: string } }>();
    const res = http.getResponse<Response>();
    const inicio = Date.now();

    // O status final só é conhecido quando a resposta termina (o filtro de exceções
    // roda depois do interceptor), por isso o log sai no evento `finish`.
    res.once('finish', () => {
      this.logger.log({
        method: req.method,
        route: req.route?.path,
        status: res.statusCode,
        durationMs: Date.now() - inicio,
        userId: req.user?.id,
      });
    });

    return next.handle();
  }
}
