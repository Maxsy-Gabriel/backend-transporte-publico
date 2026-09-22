import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  api,
  createApp,
  criarUsuario,
  limparBanco,
  login,
  SENHA_PADRAO,
} from './create-app.js';

/** Falha se aparecer senha ou hash em qualquer ponto da resposta. */
function semSegredos(corpo: unknown): void {
  expect(JSON.stringify(corpo)).not.toMatch(
    /passwordHash|"password"|currentPassword|newPassword|\$argon2/,
  );
}

describe('Autenticação, autorização e usuários', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const config = () => app.get(ConfigService);

  /** Cria um usuário do papel indicado e devolve ele com o JWT já emitido. */
  async function como(role: Role, email = `${role.toLowerCase()}@teste.com`) {
    const usuario = await criarUsuario(app, { role, email });
    return { usuario, token: await login(app, email) };
  }

  /** Assina um token qualquer (para forjar tokens inválidos nos testes). */
  const assinar = (payload: object, segredo?: string) =>
    new JwtService({
      secret: segredo ?? config().getOrThrow<string>('JWT_SECRET'),
    }).sign(payload);

  beforeAll(async () => {
    app = await createApp();
    prisma = app.get(PrismaService);
  });
  beforeEach(async () => {
    await limparBanco(app);
  });
  afterAll(async () => {
    await limparBanco(app);
    await app.close();
  });

  // ---------------------------------------------------------------------------
  describe('API key (primeira camada de proteção)', () => {
    const chave = () => config().getOrThrow<string>('API_KEY');
    const credenciais = { email: 'nao@existe.com', password: 'qualquer-coisa' };

    it('rota pública (login) sem a chave -> 401', async () => {
      const res = await api(app)
        .cru()
        .post('/auth/login')
        .send(credenciais)
        .expect(401);

      expect(res.body.message).toBe('API key ausente ou inválida.');
    });

    it('cadastro sem a chave -> 401 (a chave vale até para rotas públicas)', async () => {
      await api(app)
        .cru()
        .post('/auth/register')
        .send({ name: 'Ana', email: 'ana@teste.com', password: SENHA_PADRAO })
        .expect(401);
    });

    it.each([
      ['errada', 'chave-errada'],
      ['vazia', ''],
      ['de tamanho diferente', 'x'.repeat(500)],
    ])('chave %s -> 401', async (_nome, valor) => {
      await api(app)
        .cru()
        .post('/auth/login')
        .set('X-API-KEY', valor)
        .send(credenciais)
        .expect(401);
    });

    it('chave correta em rota pública passa (o 401 seguinte é de credenciais)', async () => {
      const res = await api(app)
        .post('/auth/login')
        .send(credenciais)
        .expect(401);

      expect(res.body.message).toBe('Credenciais inválidas.');
    });

    it('o nome do cabeçalho não diferencia maiúsculas', async () => {
      const res = await api(app)
        .cru()
        .post('/auth/login')
        .set('x-api-key', chave())
        .send(credenciais)
        .expect(401);

      expect(res.body.message).toBe('Credenciais inválidas.');
    });

    it('é conferida ANTES do JWT: token válido, mas sem a chave -> 401 de API key', async () => {
      const { token } = await como(Role.ADMIN);

      const res = await api(app)
        .cru()
        .get('/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);

      expect(res.body.message).toBe('API key ausente ou inválida.');
    });

    it('com a chave, mas sem JWT, rota protegida -> 401', async () => {
      await api(app).get('/me').expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  describe('POST /auth/register', () => {
    const corpo = {
      name: 'Maria Souza',
      email: 'maria@teste.com',
      password: SENHA_PADRAO,
    };

    it('cadastra um responsável (GUARDIAN) e não devolve senha nem hash', async () => {
      const res = await api(app).post('/auth/register').send(corpo).expect(201);

      expect(res.body).toMatchObject({
        name: 'Maria Souza',
        email: 'maria@teste.com',
        role: 'GUARDIAN',
        active: true,
      });
      expect(res.body.id).toBeDefined();
      semSegredos(res.body);
    });

    it('normaliza o e-mail (minúsculas, sem espaços) e o nome', async () => {
      const res = await api(app)
        .post('/auth/register')
        .send({ ...corpo, name: '  Maria  ', email: '  MARIA@Teste.COM ' })
        .expect(201);

      expect(res.body.email).toBe('maria@teste.com');
      expect(res.body.name).toBe('Maria');
    });

    it('guarda a senha apenas como hash argon2id', async () => {
      await api(app).post('/auth/register').send(corpo).expect(201);

      const salvo = await prisma.user.findUniqueOrThrow({
        where: { email: corpo.email },
        omit: { passwordHash: false },
      });
      expect(salvo.passwordHash.startsWith('$argon2id$')).toBe(true);
      expect(salvo.passwordHash).not.toContain(corpo.password);
    });

    it('não aceita escolher o papel: role no corpo -> 400 (mass assignment)', async () => {
      const res = await api(app)
        .post('/auth/register')
        .send({ ...corpo, role: 'ADMIN' })
        .expect(400);

      expect(JSON.stringify(res.body.message)).toContain('role');
      expect(await prisma.user.count()).toBe(0);
    });

    it('e-mail já cadastrado (mesmo com maiúsculas diferentes) -> 409', async () => {
      await api(app).post('/auth/register').send(corpo).expect(201);

      const res = await api(app)
        .post('/auth/register')
        .send({ ...corpo, email: 'MARIA@teste.com' })
        .expect(409);

      expect(res.body.message).toBe('E-mail já cadastrado.');
    });

    it('cadastros simultâneos com o mesmo e-mail: só um é criado (o outro recebe 409)', async () => {
      const respostas = await Promise.all(
        Array.from({ length: 4 }, () =>
          api(app).post('/auth/register').send(corpo),
        ),
      );

      const status = respostas.map((r) => r.status).sort((a, b) => a - b);
      expect(status).toEqual([201, 409, 409, 409]);
      expect(await prisma.user.count()).toBe(1);
    });

    it.each([
      ['e-mail inválido', { ...corpo, email: 'nao-e-email' }],
      ['senha curta', { ...corpo, password: 'curta' }],
      ['nome curto', { ...corpo, name: 'A' }],
      ['sem nome', { email: corpo.email, password: corpo.password }],
      ['corpo vazio', {}],
    ])('%s -> 400', async (_nome, invalido) => {
      const res = await api(app)
        .post('/auth/register')
        .send(invalido)
        .expect(400);

      expect(Array.isArray(res.body.message)).toBe(true);
      // Nem a senha enviada volta na resposta de erro.
      expect(JSON.stringify(res.body)).not.toContain('curta');
    });
  });

  // ---------------------------------------------------------------------------
  describe('POST /auth/login', () => {
    it('devolve o JWT (com id e papel, sem dados sensíveis)', async () => {
      const usuario = await criarUsuario(app, {
        role: Role.OPERATOR,
        email: 'op@teste.com',
      });

      const res = await api(app)
        .post('/auth/login')
        .send({ email: 'op@teste.com', password: SENHA_PADRAO })
        .expect(200);

      expect(res.body.accessToken).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
      expect(res.body.tokenType).toBe('Bearer');
      expect(res.body.expiresIn).toBe(config().getOrThrow('JWT_EXPIRES_IN'));

      const payload = JSON.parse(
        Buffer.from(res.body.accessToken.split('.')[1], 'base64url').toString(),
      );
      expect(payload).toMatchObject({ sub: usuario.id, role: 'OPERATOR' });
      expect(payload.exp).toBeGreaterThan(Date.now() / 1000);
      semSegredos(payload);
    });

    it('o e-mail do login também é normalizado', async () => {
      await criarUsuario(app, { role: Role.GUARDIAN, email: 'ana@teste.com' });

      await api(app)
        .post('/auth/login')
        .send({ email: ' ANA@Teste.com ', password: SENHA_PADRAO })
        .expect(200);
    });

    it('senha errada, e-mail inexistente e usuário inativo respondem 401 com a MESMA mensagem', async () => {
      await criarUsuario(app, {
        role: Role.GUARDIAN,
        email: 'ativo@teste.com',
      });
      await criarUsuario(app, {
        role: Role.GUARDIAN,
        email: 'inativo@teste.com',
        active: false,
      });

      const respostas = await Promise.all([
        api(app)
          .post('/auth/login')
          .send({ email: 'ativo@teste.com', password: 'senha-errada-123' }),
        api(app)
          .post('/auth/login')
          .send({ email: 'ninguem@teste.com', password: SENHA_PADRAO }),
        api(app)
          .post('/auth/login')
          .send({ email: 'inativo@teste.com', password: SENHA_PADRAO }),
      ]);

      for (const res of respostas) {
        expect(res.status).toBe(401);
        expect(res.body.message).toBe('Credenciais inválidas.');
      }
    });

    it.each([
      ['e-mail inválido', { email: 'x', password: SENHA_PADRAO }],
      ['sem senha', { email: 'a@b.com' }],
      ['senha gigante', { email: 'a@b.com', password: 'x'.repeat(129) }],
      ['campo extra', { email: 'a@b.com', password: 'x', admin: true }],
    ])('corpo inválido (%s) -> 400', async (_nome, corpo) => {
      await api(app).post('/auth/login').send(corpo).expect(400);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Proteção das rotas com JWT', () => {
    it('sem token -> 401', async () => {
      await api(app).get('/me').expect(401);
    });

    it.each([
      ['lixo no lugar do token', 'Bearer isto-nao-e-um-jwt'],
      ['esquema errado', 'Basic dXNlcjpwYXNz'],
      ['token vazio', 'Bearer '],
    ])('token inválido (%s) -> 401', async (_nome, cabecalho) => {
      await api(app).get('/me').set('Authorization', cabecalho).expect(401);
    });

    it('token expirado -> 401', async () => {
      const { usuario } = await como(Role.GUARDIAN);
      const expirado = assinar({
        sub: usuario.id,
        role: usuario.role,
        exp: Math.floor(Date.now() / 1000) - 60,
      });

      await api(app, expirado).get('/me').expect(401);
    });

    it('token assinado com outro segredo -> 401', async () => {
      const { usuario } = await como(Role.ADMIN);
      const forjado = assinar(
        { sub: usuario.id, role: 'ADMIN' },
        'outro-segredo-qualquer-com-mais-de-32-caracteres',
      );

      await api(app, forjado).get('/me').expect(401);
    });

    it('token sem assinatura (alg "none") -> 401', async () => {
      const { usuario } = await como(Role.ADMIN);
      const b64 = (o: object) =>
        Buffer.from(JSON.stringify(o)).toString('base64url');
      const semAssinatura = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: usuario.id, role: 'ADMIN' })}.`;

      await api(app, semAssinatura).get('/me').expect(401);
    });

    it('usuário desativado depois do login perde o acesso na hora', async () => {
      const { usuario, token } = await como(Role.GUARDIAN);
      await api(app, token).get('/me').expect(200);

      await prisma.user.update({
        where: { id: usuario.id },
        data: { active: false },
      });

      await api(app, token).get('/me').expect(401);
    });

    it('usuário removido depois do login -> 401', async () => {
      const { usuario, token } = await como(Role.GUARDIAN);
      await prisma.user.delete({ where: { id: usuario.id } });

      await api(app, token).get('/me').expect(401);
    });

    it('mudança de papel vale na hora (o papel vem do banco, não do token)', async () => {
      const { usuario, token } = await como(Role.ADMIN);
      await api(app, token).get('/users').expect(200);

      await prisma.user.update({
        where: { id: usuario.id },
        data: { role: Role.GUARDIAN },
      });

      await api(app, token).get('/users').expect(403);
    });
  });

  // ---------------------------------------------------------------------------
  describe('/me (operações do próprio usuário)', () => {
    it('GET devolve o perfil de quem está logado, sem segredos', async () => {
      const { usuario, token } = await como(Role.DRIVER);

      const res = await api(app, token).get('/me').expect(200);

      expect(res.body).toMatchObject({
        id: usuario.id,
        email: usuario.email,
        role: 'DRIVER',
      });
      semSegredos(res.body);
    });

    it('não existe rota com id: /me/<id> -> 404 (não há como olhar o perfil de outro)', async () => {
      const { token } = await como(Role.GUARDIAN);
      const outro = await criarUsuario(app, {
        role: Role.GUARDIAN,
        email: 'outro@teste.com',
      });

      await api(app, token).get(`/me/${outro.id}`).expect(404);
    });

    it('PATCH altera o nome', async () => {
      const { token } = await como(Role.GUARDIAN);

      const res = await api(app, token)
        .patch('/me')
        .send({ name: '  Novo Nome ' })
        .expect(200);

      expect(res.body.name).toBe('Novo Nome');
    });

    it.each([
      ['e-mail', { email: 'novo@teste.com' }],
      ['papel', { role: 'ADMIN' }],
      ['ativo', { active: false }],
      ['id', { id: '00000000-0000-7000-8000-000000000000' }],
    ])(
      'PATCH com %s no corpo -> 400 (só o nome é editável)',
      async (_nome, corpo) => {
        const { token } = await como(Role.GUARDIAN);

        await api(app, token).patch('/me').send(corpo).expect(400);
      },
    );

    it('troca a senha: a nova funciona e a antiga deixa de funcionar', async () => {
      const { usuario, token } = await como(Role.GUARDIAN);

      await api(app, token)
        .patch('/me/password')
        .send({
          currentPassword: SENHA_PADRAO,
          newPassword: 'nova-senha-456-xyz',
        })
        .expect(204);

      await api(app)
        .post('/auth/login')
        .send({ email: usuario.email, password: 'nova-senha-456-xyz' })
        .expect(200);
      await api(app)
        .post('/auth/login')
        .send({ email: usuario.email, password: SENHA_PADRAO })
        .expect(401);
    });

    it('senha atual errada -> 400 e a senha não muda', async () => {
      const { usuario, token } = await como(Role.GUARDIAN);

      await api(app, token)
        .patch('/me/password')
        .send({
          currentPassword: 'errada-errada-1',
          newPassword: 'nova-senha-456-xyz',
        })
        .expect(400);

      await api(app)
        .post('/auth/login')
        .send({ email: usuario.email, password: SENHA_PADRAO })
        .expect(200);
    });

    it('nova senha curta -> 400', async () => {
      const { token } = await como(Role.GUARDIAN);

      await api(app, token)
        .patch('/me/password')
        .send({ currentPassword: SENHA_PADRAO, newPassword: 'curta' })
        .expect(400);
    });
  });

  // ---------------------------------------------------------------------------
  describe('/users (somente ADMIN)', () => {
    const novo = {
      name: 'João Motorista',
      email: 'joao@teste.com',
      password: SENHA_PADRAO,
      role: 'DRIVER',
    };

    it.each([Role.GUARDIAN, Role.DRIVER, Role.OPERATOR])(
      '%s não acessa a administração de usuários -> 403',
      async (papel) => {
        const { token } = await como(papel);

        await api(app, token).get('/users').expect(403);
        await api(app, token).post('/users').send(novo).expect(403);
        await api(app, token)
          .patch('/users/00000000-0000-7000-8000-000000000000')
          .send({ active: false })
          .expect(403);
      },
    );

    it('ADMIN cria um motorista, que consegue entrar', async () => {
      const { token } = await como(Role.ADMIN);

      const res = await api(app, token).post('/users').send(novo).expect(201);

      expect(res.body).toMatchObject({
        email: 'joao@teste.com',
        role: 'DRIVER',
      });
      semSegredos(res.body);
      await login(app, 'joao@teste.com');
    });

    it.each([
      ['papel inexistente', { ...novo, role: 'SUPERUSER' }],
      [
        'sem papel',
        { name: novo.name, email: novo.email, password: novo.password },
      ],
      ['campo extra', { ...novo, active: false }],
    ])('criação com %s -> 400', async (_nome, corpo) => {
      const { token } = await como(Role.ADMIN);

      await api(app, token).post('/users').send(corpo).expect(400);
    });

    it('e-mail repetido -> 409', async () => {
      const { token } = await como(Role.ADMIN);
      await api(app, token).post('/users').send(novo).expect(201);

      await api(app, token).post('/users').send(novo).expect(409);
    });

    it('lista com paginação e nunca expõe segredos', async () => {
      const { token } = await como(Role.ADMIN);
      for (const n of [1, 2, 3]) {
        await criarUsuario(app, {
          role: Role.GUARDIAN,
          email: `pai${n}@teste.com`,
        });
      }

      const pagina1 = await api(app, token)
        .get('/users?page=1&limit=2')
        .expect(200);
      const pagina2 = await api(app, token)
        .get('/users?page=2&limit=2')
        .expect(200);

      expect(pagina1.body).toMatchObject({ total: 4, page: 1, limit: 2 });
      expect(pagina1.body.data).toHaveLength(2);
      expect(pagina2.body.data).toHaveLength(2);
      semSegredos(pagina1.body);
    });

    it.each([
      ['página zero', '?page=0'],
      ['limite acima do máximo', '?limit=101'],
      ['limite não numérico', '?limit=abc'],
      ['parâmetro desconhecido', '?foo=1'],
    ])('paginação inválida (%s) -> 400', async (_nome, query) => {
      const { token } = await como(Role.ADMIN);

      await api(app, token).get(`/users${query}`).expect(400);
    });

    it('GET /users/:id: existente 200, inexistente 404, id inválido 400', async () => {
      const { token } = await como(Role.ADMIN);
      const alvo = await criarUsuario(app, {
        role: Role.GUARDIAN,
        email: 'alvo@teste.com',
      });

      const achado = await api(app, token).get(`/users/${alvo.id}`).expect(200);
      semSegredos(achado.body);
      await api(app, token)
        .get('/users/00000000-0000-7000-8000-000000000000')
        .expect(404);
      await api(app, token).get('/users/isto-nao-e-um-uuid').expect(400);
    });

    it('PATCH altera papel e situação de outro usuário', async () => {
      const { token } = await como(Role.ADMIN);
      const alvo = await criarUsuario(app, {
        role: Role.GUARDIAN,
        email: 'alvo@teste.com',
      });

      const res = await api(app, token)
        .patch(`/users/${alvo.id}`)
        .send({ role: 'OPERATOR', active: false })
        .expect(200);

      expect(res.body).toMatchObject({ role: 'OPERATOR', active: false });
      // O usuário desativado não consegue mais entrar.
      await api(app)
        .post('/auth/login')
        .send({ email: 'alvo@teste.com', password: SENHA_PADRAO })
        .expect(401);
    });

    it.each([
      ['e-mail', { email: 'outro@teste.com' }],
      ['hash da senha', { passwordHash: 'x' }],
      ['id', { id: '00000000-0000-7000-8000-000000000000' }],
    ])('PATCH com %s no corpo -> 400', async (_nome, corpo) => {
      const { token } = await como(Role.ADMIN);
      const alvo = await criarUsuario(app, {
        role: Role.GUARDIAN,
        email: 'alvo@teste.com',
      });

      await api(app, token).patch(`/users/${alvo.id}`).send(corpo).expect(400);
    });

    it('PATCH em usuário inexistente -> 404', async () => {
      const { token } = await como(Role.ADMIN);

      await api(app, token)
        .patch('/users/00000000-0000-7000-8000-000000000000')
        .send({ active: false })
        .expect(404);
    });

    it('o admin não pode desativar nem rebaixar a própria conta (409), mas pode mudar o nome', async () => {
      const { usuario, token } = await como(Role.ADMIN);

      await api(app, token)
        .patch(`/users/${usuario.id}`)
        .send({ active: false })
        .expect(409);
      await api(app, token)
        .patch(`/users/${usuario.id}`)
        .send({ role: 'GUARDIAN' })
        .expect(409);
      await api(app, token)
        .patch(`/users/${usuario.id}`)
        .send({ name: 'Nome Novo' })
        .expect(200);
    });

    it('terceiros: um responsável não lê o cadastro de outro usuário (403)', async () => {
      const admin = await criarUsuario(app, {
        role: Role.ADMIN,
        email: 'admin@teste.com',
      });
      const { token } = await como(Role.GUARDIAN);

      await api(app, token).get(`/users/${admin.id}`).expect(403);
    });
  });
});
