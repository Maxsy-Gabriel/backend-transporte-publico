/**
 * Configuração do Prisma CLI (Prisma 7.10.0) - arquivo exigido pelo AV-09.
 *
 * No Prisma 7 a URL do banco NÃO fica mais no schema.prisma: ela é definida aqui.
 * Este arquivo é lido apenas pelo CLI (generate, migrate, db seed...). Em runtime
 * a aplicação recebe a URL pelo ConfigService e cria o PrismaClient com o driver
 * adapter (@prisma/adapter-pg).
 *
 * Use sempre os scripts `npm run db:*`, que executam o Prisma 7.10.0 fixado neste
 * projeto. Não use `npx prisma@latest`: a linha 8.x usa outro formato de config.
 */
import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// O Prisma CLI não carrega arquivos .env sozinho. O arquivo é escolhido pelo ambiente:
//  - NODE_ENV=test -> .env.test (banco transporte_escolar_test)
//  - demais casos  -> .env      (desenvolvimento)
// Em produção não existe arquivo: as variáveis vêm do ambiente da plataforma e o
// dotenv simplesmente ignora o arquivo ausente.
config({
  path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
  quiet: true,
});

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // Comando executado por `prisma db seed` (administrador inicial).
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Lido com process.env (e não com env()) de propósito: `prisma generate` não
    // conecta no banco e precisa funcionar em um clone limpo, sem .env. Comandos
    // que conectam (migrate) falham com mensagem clara se a variável estiver vazia.
    url: process.env.DATABASE_URL,
  },
});
