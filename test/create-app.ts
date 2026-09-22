import type { INestApplication, Type } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import argon2 from 'argon2';
import compression from 'compression';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import type { Role } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  configurarSwagger,
  helmetComExcecaoParaOSwagger,
} from '../src/swagger.js';

/** Senha padrão dos usuários criados nos testes. */
export const SENHA_PADRAO = 'senha-de-teste-123';

/**
 * Sobe a aplicação para os testes e2e: mesmo AppModule (com pipe, filtro, interceptor e
 * guards globais), o mesmo helmet/compression/Swagger do main.ts (funções compartilhadas em
 * `src/swagger.ts`, para os dois baterem exatamente no mesmo comportamento).
 *
 * `controllers`: controllers extras só para o teste (rotas que forçam situações de erro).
 * O logger fica desligado para não poluir a saída dos testes.
 */
export async function createApp(
  controllers: Type<unknown>[] = [],
): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers,
  }).compile();

  const app = moduleRef.createNestApplication({ logger: false });
  app.use(helmetComExcecaoParaOSwagger);
  app.use(compression());
  configurarSwagger(app);
  await app.init();
  return app;
}

/**
 * Cliente HTTP dos testes. Já envia o cabeçalho X-API-KEY (exigido em TODA rota) e, se
 * `token` for informado, o `Authorization: Bearer`. Use `cru()` para enviar sem nada.
 */
export function api(app: INestApplication, token?: string) {
  const servidor = app.getHttpServer();
  const chave = app.get(ConfigService).getOrThrow<string>('API_KEY');
  const comCredenciais = (req: request.Test) => {
    req.set('X-API-KEY', chave);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  return {
    get: (url: string) => comCredenciais(request(servidor).get(url)),
    post: (url: string) => comCredenciais(request(servidor).post(url)),
    patch: (url: string) => comCredenciais(request(servidor).patch(url)),
    put: (url: string) => comCredenciais(request(servidor).put(url)),
    delete: (url: string) => comCredenciais(request(servidor).delete(url)),
    /** Sem API key e sem token: para provar que a rota recusa. */
    cru: () => request(servidor),
  };
}

/** Esvazia todas as tabelas do banco de TESTES (cada teste começa do zero). */
export async function limparBanco(app: INestApplication): Promise<void> {
  // Lista fixa de tabelas (nenhum valor externo entra nesta consulta).
  await app
    .get(PrismaService)
    .$executeRawUnsafe(
      'TRUNCATE TABLE boarding_records, trips, guardian_relations, students, route_stops, routes, drivers, vehicles, users CASCADE',
    );
}

/** Cria um usuário direto no banco (hash argon2 com custo baixo, para os testes ficarem rápidos). */
export function criarUsuario(
  app: INestApplication,
  dados: {
    role: Role;
    email: string;
    senha?: string;
    name?: string;
    active?: boolean;
  },
) {
  return argon2
    .hash(dados.senha ?? SENHA_PADRAO, {
      memoryCost: 1024,
      timeCost: 2,
      parallelism: 1,
    })
    .then((passwordHash) =>
      app.get(PrismaService).user.create({
        data: {
          name: dados.name ?? `Usuário ${dados.role}`,
          email: dados.email,
          role: dados.role,
          active: dados.active ?? true,
          passwordHash,
        },
      }),
    );
}

/** Faz login pela API e devolve o JWT. */
export async function login(
  app: INestApplication,
  email: string,
  senha: string = SENHA_PADRAO,
): Promise<string> {
  const res = await api(app)
    .post('/auth/login')
    .send({ email, password: senha })
    .expect(200);
  return res.body.accessToken as string;
}

/** Cria um usuário do papel indicado e devolve ele junto com o JWT já emitido. */
export async function como(
  app: INestApplication,
  role: Role,
  email = `${role.toLowerCase()}@teste.com`,
) {
  const usuario = await criarUsuario(app, { role, email });
  return { usuario, token: await login(app, email) };
}
