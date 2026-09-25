import type { INestApplication } from '@nestjs/common';
import { Role } from '../src/generated/prisma/client.js';
import { api, como, createApp, limparBanco } from './create-app.js';

const ID = '00000000-0000-7000-8000-000000000000';
const TODOS_OS_PAPEIS = [Role.GUARDIAN, Role.DRIVER, Role.OPERATOR, Role.ADMIN];

/**
 * Toda rota autenticada da API (menos `/auth/*`, cobertas à parte no fim do arquivo), com os
 * papéis que DEVEM entrar. `papeis: 'qualquer'` = sem `@Roles`, ou seja, qualquer autenticado
 * (ex.: `/me`). Lista extraída direto dos `@Controller`/`@Roles` de cada arquivo em `src/`;
 * qualquer rota nova precisa ser somada aqui, senão este arquivo não a cobre.
 */
const ROTAS: {
  metodo: 'get' | 'post' | 'patch' | 'delete';
  caminho: string;
  papeis: Role[] | 'qualquer';
}[] = [
  // --- me (qualquer autenticado) ---
  { metodo: 'get', caminho: '/me', papeis: 'qualquer' },
  { metodo: 'patch', caminho: '/me', papeis: 'qualquer' },
  { metodo: 'patch', caminho: '/me/password', papeis: 'qualquer' },
  // --- me/students, me/routes (um papel só) ---
  { metodo: 'get', caminho: '/me/students', papeis: [Role.GUARDIAN] },
  { metodo: 'get', caminho: '/me/routes', papeis: [Role.DRIVER] },
  // --- users (criar/alterar: só ADMIN; consultar: também OPERATOR, pra achar o id de um
  // usuário na hora de criar o perfil de motorista ou o vínculo responsável-aluno) ---
  { metodo: 'post', caminho: '/users', papeis: [Role.ADMIN] },
  { metodo: 'get', caminho: '/users', papeis: [Role.OPERATOR, Role.ADMIN] },
  {
    metodo: 'get',
    caminho: `/users/${ID}`,
    papeis: [Role.OPERATOR, Role.ADMIN],
  },
  { metodo: 'patch', caminho: `/users/${ID}`, papeis: [Role.ADMIN] },
  { metodo: 'delete', caminho: `/users/${ID}`, papeis: [Role.ADMIN] },
  // --- vehicles (OPERATOR/ADMIN) ---
  { metodo: 'post', caminho: '/vehicles', papeis: [Role.OPERATOR, Role.ADMIN] },
  { metodo: 'get', caminho: '/vehicles', papeis: [Role.OPERATOR, Role.ADMIN] },
  {
    metodo: 'get',
    caminho: `/vehicles/${ID}`,
    papeis: [Role.OPERATOR, Role.ADMIN],
  },
  {
    metodo: 'patch',
    caminho: `/vehicles/${ID}`,
    papeis: [Role.OPERATOR, Role.ADMIN],
  },
  {
    metodo: 'get',
    caminho: `/vehicles/${ID}/routes`,
    papeis: [Role.OPERATOR, Role.ADMIN],
  },
  {
    metodo: 'delete',
    caminho: `/vehicles/${ID}`,
    papeis: [Role.OPERATOR, Role.ADMIN],
  },
  // --- drivers (OPERATOR/ADMIN) ---
  { metodo: 'post', caminho: '/drivers', papeis: [Role.OPERATOR, Role.ADMIN] },
  { metodo: 'get', caminho: '/drivers', papeis: [Role.OPERATOR, Role.ADMIN] },
  {
    metodo: 'get',
    caminho: `/drivers/${ID}`,
    papeis: [Role.OPERATOR, Role.ADMIN],
  },
  {
    metodo: 'patch',
    caminho: `/drivers/${ID}`,
    papeis: [Role.OPERATOR, Role.ADMIN],
  },
  {
    metodo: 'get',
    caminho: `/drivers/${ID}/routes`,
    papeis: [Role.OPERATOR, Role.ADMIN],
  },
  {
    metodo: 'delete',
    caminho: `/drivers/${ID}`,
    papeis: [Role.OPERATOR, Role.ADMIN],
  },
  // --- routes (escrita OPERATOR/ADMIN; leitura também DRIVER) ---
  { metodo: 'post', caminho: '/routes', papeis: [Role.OPERATOR, Role.ADMIN] },
  {
    metodo: 'get',
    caminho: '/routes',
    papeis: [Role.OPERATOR, Role.ADMIN, Role.DRIVER],
  },
  {
    metodo: 'get',
    caminho: `/routes/${ID}`,
    papeis: [Role.OPERATOR, Role.ADMIN, Role.DRIVER],
  },
  {
    metodo: 'patch',
    caminho: `/routes/${ID}`,
    papeis: [Role.OPERATOR, Role.ADMIN],
  },
  {
    metodo: 'post',
    caminho: `/routes/${ID}/activate`,
    papeis: [Role.OPERATOR, Role.ADMIN],
  },
  {
    metodo: 'post',
    caminho: `/routes/${ID}/deactivate`,
    papeis: [Role.OPERATOR, Role.ADMIN],
  },
  {
    metodo: 'delete',
    caminho: `/routes/${ID}`,
    papeis: [Role.OPERATOR, Role.ADMIN],
  },
  {
    metodo: 'get',
    caminho: `/routes/${ID}/students`,
    papeis: [Role.OPERATOR, Role.ADMIN, Role.DRIVER],
  },
  // --- stops (escrita OPERATOR/ADMIN; leitura também DRIVER) ---
  {
    metodo: 'post',
    caminho: `/routes/${ID}/stops`,
    papeis: [Role.OPERATOR, Role.ADMIN],
  },
  {
    metodo: 'get',
    caminho: `/routes/${ID}/stops`,
    papeis: [Role.OPERATOR, Role.ADMIN, Role.DRIVER],
  },
  {
    metodo: 'delete',
    caminho: `/routes/${ID}/stops/${ID}`,
    papeis: [Role.OPERATOR, Role.ADMIN],
  },
  // --- students (escrita OPERATOR/ADMIN; leitura de um também DRIVER/GUARDIAN) ---
  { metodo: 'post', caminho: '/students', papeis: [Role.OPERATOR, Role.ADMIN] },
  { metodo: 'get', caminho: '/students', papeis: [Role.OPERATOR, Role.ADMIN] },
  { metodo: 'get', caminho: `/students/${ID}`, papeis: TODOS_OS_PAPEIS },
  {
    metodo: 'patch',
    caminho: `/students/${ID}`,
    papeis: [Role.OPERATOR, Role.ADMIN],
  },
  {
    metodo: 'patch',
    caminho: `/students/${ID}/route`,
    papeis: [Role.OPERATOR, Role.ADMIN],
  },
  {
    metodo: 'get',
    caminho: `/students/${ID}/guardians`,
    papeis: [Role.OPERATOR, Role.ADMIN],
  },
  {
    metodo: 'get',
    caminho: `/students/${ID}/boardings`,
    papeis: TODOS_OS_PAPEIS,
  },
  {
    metodo: 'delete',
    caminho: `/students/${ID}`,
    papeis: [Role.OPERATOR, Role.ADMIN],
  },
  // --- guardian-relations ---
  {
    metodo: 'post',
    caminho: '/guardian-relations',
    papeis: [Role.OPERATOR, Role.ADMIN],
  },
  {
    metodo: 'get',
    caminho: '/guardian-relations',
    papeis: [Role.GUARDIAN, Role.OPERATOR, Role.ADMIN],
  },
  {
    metodo: 'get',
    caminho: `/guardian-relations/${ID}`,
    papeis: [Role.GUARDIAN, Role.OPERATOR, Role.ADMIN],
  },
  {
    metodo: 'post',
    caminho: `/guardian-relations/${ID}/document`,
    papeis: [Role.GUARDIAN],
  },
  {
    metodo: 'get',
    caminho: `/guardian-relations/${ID}/document`,
    papeis: [Role.GUARDIAN, Role.OPERATOR, Role.ADMIN],
  },
  {
    metodo: 'post',
    caminho: `/guardian-relations/${ID}/approve`,
    papeis: [Role.OPERATOR, Role.ADMIN],
  },
  {
    metodo: 'post',
    caminho: `/guardian-relations/${ID}/reject`,
    papeis: [Role.OPERATOR, Role.ADMIN],
  },
  {
    metodo: 'post',
    caminho: `/guardian-relations/${ID}/revoke`,
    papeis: [Role.OPERATOR, Role.ADMIN],
  },
  // --- trips e boardings (DRIVER opera; leitura também staff) ---
  { metodo: 'post', caminho: `/routes/${ID}/trips`, papeis: [Role.DRIVER] },
  {
    metodo: 'get',
    caminho: '/trips',
    papeis: [Role.OPERATOR, Role.ADMIN, Role.DRIVER],
  },
  {
    metodo: 'get',
    caminho: `/trips/${ID}`,
    papeis: [Role.OPERATOR, Role.ADMIN, Role.DRIVER],
  },
  {
    metodo: 'get',
    caminho: `/trips/${ID}/boardings`,
    papeis: [Role.OPERATOR, Role.ADMIN, Role.DRIVER],
  },
  { metodo: 'post', caminho: `/trips/${ID}/finish`, papeis: [Role.DRIVER] },
  { metodo: 'post', caminho: `/trips/${ID}/boardings`, papeis: [Role.DRIVER] },
  { metodo: 'post', caminho: `/boardings/${ID}/alight`, papeis: [Role.DRIVER] },
];

describe('Matriz de permissões (cobertura sistemática de todas as rotas)', () => {
  let app: INestApplication;
  const tokens = new Map<Role, string>();

  beforeAll(async () => {
    app = await createApp();
    await limparBanco(app);
    for (const papel of TODOS_OS_PAPEIS) {
      tokens.set(papel, (await como(app, papel)).token);
    }
  });
  afterAll(async () => {
    await limparBanco(app);
    await app.close();
  });

  const chamar = (
    metodo: (typeof ROTAS)[number]['metodo'],
    caminho: string,
    token?: string,
  ) => {
    const req = api(app, token)[metodo](caminho);
    // POST/PATCH sem corpo real: o objetivo aqui é só a camada de autorização, que roda antes
    // do ValidationPipe. Um corpo vazio não muda o veredito de 401/403.
    return metodo === 'post' || metodo === 'patch' ? req.send({}) : req;
  };

  describe.each(ROTAS)('$metodo $caminho', ({ metodo, caminho, papeis }) => {
    it('sem token -> 401', async () => {
      const res = await chamar(metodo, caminho);
      expect(res.status).toBe(401);
    });

    it('sem API key (mas com token) -> 401', async () => {
      const primeiroPapel = papeis === 'qualquer' ? Role.ADMIN : papeis[0];
      const token = tokens.get(primeiroPapel)!;
      const req = api(app)
        .cru()
        [metodo](caminho)
        .set('Authorization', `Bearer ${token}`);
      const res = await (metodo === 'post' || metodo === 'patch'
        ? req.send({})
        : req);
      expect(res.status).toBe(401);
    });

    if (papeis === 'qualquer') {
      it('qualquer papel autenticado passa da autorização (nunca 401/403)', async () => {
        for (const papel of TODOS_OS_PAPEIS) {
          const res = await chamar(metodo, caminho, tokens.get(papel));
          expect([401, 403]).not.toContain(res.status);
        }
      });
    } else {
      it('papel permitido passa da autorização (nunca 401/403)', async () => {
        for (const papel of papeis) {
          const res = await chamar(metodo, caminho, tokens.get(papel));
          expect([401, 403]).not.toContain(res.status);
        }
      });

      const negados = TODOS_OS_PAPEIS.filter((p) => !papeis.includes(p));
      it.each(negados)('%s NÃO tem permissão -> 403', async (papel) => {
        const res = await chamar(metodo, caminho, tokens.get(papel));
        expect(res.status).toBe(403);
      });
    }
  });

  // ---------------------------------------------------------------------------
  // GET /, POST /auth/register e POST /auth/login: rotas @Public (dispensam JWT), mas
  // continuam exigindo a API key, igual a qualquer outra rota.
  describe('GET / (@Public: sem token, mas com API key)', () => {
    it('sem API key -> 401', async () => {
      await api(app).cru().get('/').expect(401);
    });

    it('com API key e sem token -> 200 (nunca 401 por falta de token)', async () => {
      await api(app).get('/').expect(200);
    });
  });

  describe('POST /auth/register e POST /auth/login (@Public: sem token, mas com API key)', () => {
    it('sem API key -> 401', async () => {
      await api(app).cru().post('/auth/register').send({}).expect(401);
      await api(app).cru().post('/auth/login').send({}).expect(401);
    });

    it('com API key e sem token -> passa da autorização (nunca 401 por falta de token)', async () => {
      const registro = await api(app).post('/auth/register').send({});
      const login = await api(app).post('/auth/login').send({});
      // Corpo vazio: cai em 400 de validação, não em 401 (a rota é pública de verdade).
      expect(registro.status).toBe(400);
      expect(login.status).toBe(400);
    });
  });
});
