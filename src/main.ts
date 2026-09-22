import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import compression from 'compression';
import { AppModule } from './app.module.js';
import { configurarSwagger, helmetComExcecaoParaOSwagger } from './swagger.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Cabeçalhos de segurança HTTP (CSP, HSTS, nosniff...), com uma exceção para o Swagger
  // (ver swagger.ts), e compressão gzip das respostas.
  app.use(helmetComExcecaoParaOSwagger);
  app.use(compression());
  configurarSwagger(app);

  // Encerramento gracioso: ao receber SIGTERM/SIGINT fecha o servidor e o pool do banco.
  app.enableShutdownHooks();

  await app.listen(app.get(ConfigService).getOrThrow<number>('PORT'));
}

await bootstrap();
