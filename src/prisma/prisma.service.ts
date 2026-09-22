import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * Único ponto de acesso ao banco: PrismaClient (Prisma 7) com o driver adapter do
 * PostgreSQL (@prisma/adapter-pg). A URL vem do ConfigService (.env), nunca do código.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: ConfigService<EnvironmentVariables, true>) {
    super({
      adapter: new PrismaPg({
        connectionString: config.getOrThrow('DATABASE_URL', { infer: true }),
        // Com o banco fora do ar, falha em 5 s em vez de deixar a requisição pendurada.
        connectionTimeoutMillis: 5_000,
      }),
      // O Prisma não imprime nada sozinho: as mensagens de erro dele podem conter valores
      // das linhas (dados pessoais). Os erros são tratados pelo PrismaExceptionFilter.
      log: [],
      // O hash da senha NUNCA sai em consultas: é omitido por padrão em todo acesso ao User.
      // Só o login e a troca de senha o pedem, explicitamente (`omit: { passwordHash: false }`).
      omit: { user: { passwordHash: true } },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  /** Fecha o pool ao encerrar a aplicação (SIGTERM/SIGINT, via enableShutdownHooks). */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
