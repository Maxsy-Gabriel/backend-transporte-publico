import type { INestApplication } from '@nestjs/common';
import {
  GuardianRelationStatus,
  Relationship,
  Role,
  RouteStatus,
} from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { api, como, createApp, limparBanco, login } from './create-app.js';
import { fabricas } from './factories.js';

const UUID_INEXISTENTE = '00000000-0000-7000-8000-000000000000';

describe('Alunos, alocação em rota e capacidade', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let f: ReturnType<typeof fabricas>;

  const NOVO = {
    name: 'Ana Souza',
    birthDate: '2015-03-20',
    registrationNumber: 'mat-001',
    schoolName: 'Escola Municipal Centro',
  };

  /** Rota (rascunho) com um veículo da capacidade pedida e um ponto. */
  async function rotaComVagas(capacidade: number) {
    const veiculo = await f.veiculo({ capacity: capacidade });
    const rota = await f.rota({ vehicleId: veiculo.id });
    const ponto = await f.ponto(rota.id);
    return { veiculo, rota, ponto };
  }

  /** Responsável autenticado com vínculo com o aluno na situação indicada. */
  async function responsavelVinculado(
    alunoId: string,
    status: GuardianRelationStatus,
    email = 'mae@teste.com',
  ) {
    const { usuario, token } = await como(app, Role.GUARDIAN, email);
    await prisma.guardianRelation.create({
      data: {
        guardianId: usuario.id,
        studentId: alunoId,
        relationship: Relationship.MOTHER,
        status,
      },
    });
    return { usuario, token };
  }

  /** Deixa o aluno a bordo de uma viagem em andamento da rota. */
  async function embarcar(alunoId: string, rotaId: string) {
    const motorista = await f.motorista();
    const viagem = await prisma.trip.create({ data: { routeId: rotaId } });
    await prisma.boardingRecord.create({
      data: {
        tripId: viagem.id,
        studentId: alunoId,
        registeredById: motorista.userId,
      },
    });
  }

  beforeAll(async () => {
    app = await createApp();
    prisma = app.get(PrismaService);
    f = fabricas(app);
  });
  beforeEach(async () => {
    await limparBanco(app);
  });
  afterAll(async () => {
    await limparBanco(app);
    await app.close();
  });

  // ---------------------------------------------------------------------------
  describe('permissões da gestão de alunos', () => {
    it.each([Role.GUARDIAN, Role.DRIVER])(
      '%s não cria, lista, altera nem aloca alunos -> 403',
      async (papel) => {
        const { token } = await como(app, papel);
        const aluno = await f.aluno();

        await api(app, token).post('/students').send(NOVO).expect(403);
        await api(app, token).get('/students').expect(403);
        await api(app, token)
          .patch(`/students/${aluno.id}`)
          .send({ name: 'Novo Nome' })
          .expect(403);
        await api(app, token)
          .patch(`/students/${aluno.id}/route`)
          .send({ routeId: null })
          .expect(403);
        await api(app, token)
          .get(`/students/${aluno.id}/guardians`)
          .expect(403);
      },
    );

    it.each([Role.OPERATOR, Role.ADMIN])(
      '%s cadastra aluno (201)',
      async (papel) => {
        const { token } = await como(app, papel);

        await api(app, token).post('/students').send(NOVO).expect(201);
      },
    );

    it('DRIVER e OPERATOR não usam /me/students (é do responsável) -> 403', async () => {
      for (const papel of [Role.DRIVER, Role.OPERATOR, Role.ADMIN]) {
        const { token } = await como(app, papel);
        await api(app, token).get('/me/students').expect(403);
      }
    });
  });

  // ---------------------------------------------------------------------------
  describe('POST /students', () => {
    it('cadastra o aluno sem rota, com a matrícula em maiúsculas', async () => {
      const { token } = await como(app, Role.OPERATOR);

      const res = await api(app, token)
        .post('/students')
        .send(NOVO)
        .expect(201);

      expect(res.body).toMatchObject({
        name: 'Ana Souza',
        registrationNumber: 'MAT-001',
        schoolName: 'Escola Municipal Centro',
        active: true,
        route: null,
        stop: null,
      });
      expect(res.body.birthDate).toContain('2015-03-20');
    });

    it('matrícula repetida (mesmo com outra caixa) -> 409', async () => {
      const { token } = await como(app, Role.OPERATOR);
      await api(app, token).post('/students').send(NOVO).expect(201);

      const res = await api(app, token)
        .post('/students')
        .send({ ...NOVO, name: 'Outro Aluno', registrationNumber: 'MAT-001' })
        .expect(409);

      expect(res.body.message).toBe('Matrícula já cadastrada.');
    });

    it.each([
      ['nome curto', { name: 'A' }],
      ['data no formato brasileiro', { birthDate: '20/03/2015' }],
      ['data inexistente', { birthDate: '2015-02-31' }],
      ['data em texto', { birthDate: 'ontem' }],
      ['nascimento no futuro', { birthDate: '2999-01-01' }],
      ['matrícula curta', { registrationNumber: 'ab' }],
      ['matrícula com espaço', { registrationNumber: 'ab cd' }],
      ['matrícula com símbolos', { registrationNumber: '!!!###' }],
      ['escola curta', { schoolName: 'E' }],
      [
        'rota no corpo (só pelo endpoint de alocação)',
        { routeId: UUID_INEXISTENTE },
      ],
      ['active no corpo', { active: false }],
    ])('corpo inválido (%s) -> 400', async (_nome, alteracao) => {
      const { token } = await como(app, Role.OPERATOR);

      await api(app, token)
        .post('/students')
        .send({ ...NOVO, ...alteracao })
        .expect(400);
    });

    it('corpo vazio ou incompleto -> 400', async () => {
      const { token } = await como(app, Role.OPERATOR);

      await api(app, token).post('/students').send({}).expect(400);
      await api(app, token)
        .post('/students')
        .send({ name: 'Ana Souza' })
        .expect(400);
    });
  });

  // ---------------------------------------------------------------------------
  describe('GET /students (lista e busca)', () => {
    it('lista paginada e ordenada por nome', async () => {
      const { token } = await como(app, Role.OPERATOR);
      await f.aluno({ name: 'Carla Dias' });
      await f.aluno({ name: 'Ana Lima' });
      await f.aluno({ name: 'Bruno Costa' });

      const res = await api(app, token).get('/students?limit=2').expect(200);

      expect(res.body).toMatchObject({ total: 3, page: 1, limit: 2 });
      expect(res.body.data.map((a: { name: string }) => a.name)).toEqual([
        'Ana Lima',
        'Bruno Costa',
      ]);
    });

    it('busca por trecho do nome ou da matrícula, sem diferenciar maiúsculas', async () => {
      const { token } = await como(app, Role.OPERATOR);
      await f.aluno({ name: 'Ana Lima', registrationNumber: 'MAT100' });
      await f.aluno({ name: 'Bruno Costa', registrationNumber: 'MAT200' });

      const porNome = await api(app, token)
        .get('/students?search=ANA')
        .expect(200);
      const porMatricula = await api(app, token)
        .get('/students?search=mat2')
        .expect(200);

      expect(porNome.body.data.map((a: { name: string }) => a.name)).toEqual([
        'Ana Lima',
      ]);
      expect(
        porMatricula.body.data.map((a: { name: string }) => a.name),
      ).toEqual(['Bruno Costa']);
    });

    it('o coringa % da busca não vira "tudo" (é tratado como texto)', async () => {
      const { token } = await como(app, Role.OPERATOR);
      await f.aluno({ name: 'Ana Lima' });

      const porcento = await api(app, token)
        .get('/students?search=%25')
        .expect(200);
      const sublinhado = await api(app, token)
        .get('/students?search=_')
        .expect(200);

      expect(porcento.body.total).toBe(0);
      expect(sublinhado.body.total).toBe(0);
    });

    it('filtra por rota', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const { rota } = await rotaComVagas(5);
      await f.aluno({ routeId: rota.id });
      await f.aluno();

      const res = await api(app, token)
        .get(`/students?routeId=${rota.id}`)
        .expect(200);

      expect(res.body.total).toBe(1);
    });

    it.each([
      ['rota que não é UUID', '?routeId=abc'],
      ['busca gigante', `?search=${'x'.repeat(101)}`],
      ['página zero', '?page=0'],
      ['parâmetro desconhecido', '?foo=1'],
    ])('consulta inválida (%s) -> 400', async (_nome, query) => {
      const { token } = await como(app, Role.OPERATOR);

      await api(app, token).get(`/students${query}`).expect(400);
    });
  });

  // ---------------------------------------------------------------------------
  describe('GET /students/:id (quem pode ver o aluno)', () => {
    it('secretaria e admin veem qualquer aluno, com a data de nascimento', async () => {
      const aluno = await f.aluno();
      for (const papel of [Role.OPERATOR, Role.ADMIN]) {
        const { token } = await como(app, papel);

        const res = await api(app, token)
          .get(`/students/${aluno.id}`)
          .expect(200);

        expect(res.body.birthDate).toBeDefined();
      }
    });

    it('responsável com vínculo APROVADO vê o aluno (com rota e ponto)', async () => {
      const { rota, ponto } = await rotaComVagas(5);
      const aluno = await f.aluno({ routeId: rota.id, stopId: ponto.id });
      const { token } = await responsavelVinculado(
        aluno.id,
        GuardianRelationStatus.ACTIVE,
      );

      const res = await api(app, token)
        .get(`/students/${aluno.id}`)
        .expect(200);

      expect(res.body).toMatchObject({
        id: aluno.id,
        route: { id: rota.id },
        stop: { id: ponto.id },
      });
    });

    it.each([
      GuardianRelationStatus.PENDING,
      GuardianRelationStatus.REJECTED,
      GuardianRelationStatus.REVOKED,
    ])('responsável com vínculo %s NÃO vê o aluno -> 403', async (status) => {
      const aluno = await f.aluno();
      const { token } = await responsavelVinculado(aluno.id, status);

      await api(app, token).get(`/students/${aluno.id}`).expect(403);
    });

    it('responsável sem vínculo, ou com vínculo com OUTRO aluno -> 403', async () => {
      const meuFilho = await f.aluno();
      const filhoDeOutro = await f.aluno();
      const { token } = await responsavelVinculado(
        meuFilho.id,
        GuardianRelationStatus.ACTIVE,
      );

      await api(app, token).get(`/students/${meuFilho.id}`).expect(200);
      await api(app, token).get(`/students/${filhoDeOutro.id}`).expect(403);
    });

    it('motorista vê o aluno da SUA rota (sem a data de nascimento) e não os demais', async () => {
      const motorista = await f.motorista();
      const token = await login(app, motorista.user.email);
      const minha = await f.rota({ driverId: motorista.id });
      const dele = await f.aluno({ routeId: minha.id });
      const deOutraRota = await f.aluno({ routeId: (await f.rota()).id });
      const semRota = await f.aluno();

      const res = await api(app, token).get(`/students/${dele.id}`).expect(200);

      expect(res.body.id).toBe(dele.id);
      expect(res.body.birthDate).toBeUndefined();
      await api(app, token).get(`/students/${deOutraRota.id}`).expect(403);
      await api(app, token).get(`/students/${semRota.id}`).expect(403);
    });

    it('404 para aluno inexistente e 400 para id inválido', async () => {
      const { token } = await como(app, Role.OPERATOR);

      await api(app, token).get(`/students/${UUID_INEXISTENTE}`).expect(404);
      await api(app, token).get('/students/abc').expect(400);
    });
  });

  // ---------------------------------------------------------------------------
  describe('PATCH /students/:id', () => {
    it('altera os dados do aluno', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const aluno = await f.aluno();

      const res = await api(app, token)
        .patch(`/students/${aluno.id}`)
        .send({
          name: 'Nome Corrigido',
          birthDate: '2014-01-02',
          schoolName: 'Outra Escola',
          registrationNumber: 'novo-123',
        })
        .expect(200);

      expect(res.body).toMatchObject({
        name: 'Nome Corrigido',
        schoolName: 'Outra Escola',
        registrationNumber: 'NOVO-123',
      });
      expect(res.body.birthDate).toContain('2014-01-02');
    });

    it('matrícula de outro aluno -> 409; a própria matrícula pode ser reenviada', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const a = await f.aluno({ registrationNumber: 'MAT100' });
      const b = await f.aluno({ registrationNumber: 'MAT200' });

      await api(app, token)
        .patch(`/students/${b.id}`)
        .send({ registrationNumber: 'MAT100' })
        .expect(409);
      await api(app, token)
        .patch(`/students/${a.id}`)
        .send({ registrationNumber: 'MAT100' })
        .expect(200);
    });

    it.each([
      ['nascimento no futuro', { birthDate: '2999-01-01' }],
      ['rota no corpo', { routeId: UUID_INEXISTENTE }],
      ['ponto no corpo', { stopId: UUID_INEXISTENTE }],
      ['active em texto', { active: 'sim' }],
      ['nome curto', { name: 'A' }],
    ])('PATCH com %s -> 400', async (_nome, corpo) => {
      const { token } = await como(app, Role.OPERATOR);
      const aluno = await f.aluno();

      await api(app, token)
        .patch(`/students/${aluno.id}`)
        .send(corpo)
        .expect(400);
    });

    it('404 para aluno inexistente', async () => {
      const { token } = await como(app, Role.OPERATOR);

      await api(app, token)
        .patch(`/students/${UUID_INEXISTENTE}`)
        .send({ name: 'Nome Novo' })
        .expect(404);
    });

    it('desativar tira o aluno da rota e libera a vaga', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const { rota, ponto } = await rotaComVagas(1);
      const primeiro = await f.aluno({ routeId: rota.id, stopId: ponto.id });
      const segundo = await f.aluno();
      await api(app, token)
        .patch(`/students/${segundo.id}/route`)
        .send({ routeId: rota.id, stopId: ponto.id })
        .expect(409); // lotada

      const res = await api(app, token)
        .patch(`/students/${primeiro.id}`)
        .send({ active: false })
        .expect(200);

      expect(res.body).toMatchObject({
        active: false,
        route: null,
        stop: null,
      });
      await api(app, token)
        .patch(`/students/${segundo.id}/route`)
        .send({ routeId: rota.id, stopId: ponto.id })
        .expect(200);
    });

    it('não desativa aluno que está a bordo de uma viagem em andamento (409)', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const { rota, ponto } = await rotaComVagas(5);
      const aluno = await f.aluno({ routeId: rota.id, stopId: ponto.id });
      await embarcar(aluno.id, rota.id);

      await api(app, token)
        .patch(`/students/${aluno.id}`)
        .send({ active: false })
        .expect(409);
    });
  });

  // ---------------------------------------------------------------------------
  describe('DELETE /students/:id (soft delete: equivale a PATCH { active: false })', () => {
    it('desativa o aluno (204), tira da rota e libera a vaga', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const { rota, ponto } = await rotaComVagas(1);
      const aluno = await f.aluno({ routeId: rota.id, stopId: ponto.id });
      const outro = await f.aluno();

      await api(app, token).delete(`/students/${aluno.id}`).expect(204);

      const buscado = await api(app, token)
        .get(`/students/${aluno.id}`)
        .expect(200);
      expect(buscado.body).toMatchObject({
        active: false,
        route: null,
        stop: null,
      });
      // A vaga foi liberada.
      await api(app, token)
        .patch(`/students/${outro.id}/route`)
        .send({ routeId: rota.id, stopId: ponto.id })
        .expect(200);
    });

    it('inexistente -> 404; id inválido -> 400', async () => {
      const { token } = await como(app, Role.OPERATOR);

      await api(app, token).delete(`/students/${UUID_INEXISTENTE}`).expect(404);
      await api(app, token).delete('/students/xyz').expect(400);
    });

    it('não exclui aluno que está a bordo de uma viagem em andamento (409)', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const { rota, ponto } = await rotaComVagas(5);
      const aluno = await f.aluno({ routeId: rota.id, stopId: ponto.id });
      await embarcar(aluno.id, rota.id);

      await api(app, token).delete(`/students/${aluno.id}`).expect(409);
    });

    it.each([Role.GUARDIAN, Role.DRIVER])(
      '%s não pode excluir alunos -> 403',
      async (papel) => {
        const { token } = await como(app, papel);
        const aluno = await f.aluno();

        await api(app, token).delete(`/students/${aluno.id}`).expect(403);
      },
    );
  });

  // ---------------------------------------------------------------------------
  describe('PATCH /students/:id/route (alocação e capacidade)', () => {
    it('coloca o aluno na rota, no ponto escolhido', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const { rota, ponto } = await rotaComVagas(5);
      const aluno = await f.aluno();

      const res = await api(app, token)
        .patch(`/students/${aluno.id}/route`)
        .send({ routeId: rota.id, stopId: ponto.id })
        .expect(200);

      expect(res.body.route.id).toBe(rota.id);
      expect(res.body.stop.id).toBe(ponto.id);
      const detalhe = await api(app, token)
        .get(`/routes/${rota.id}`)
        .expect(200);
      expect(detalhe.body.studentsCount).toBe(1);
    });

    it('REGRA DE CAPACIDADE: o 4º aluno numa van de 3 lugares recebe 409, e uma vaga liberada é reaproveitada', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const { rota, ponto } = await rotaComVagas(3);
      const alunos = [
        await f.aluno(),
        await f.aluno(),
        await f.aluno(),
        await f.aluno(),
      ];
      const alocar = (id: string) =>
        api(app, token)
          .patch(`/students/${id}/route`)
          .send({ routeId: rota.id, stopId: ponto.id });

      for (const aluno of alunos.slice(0, 3))
        await alocar(aluno.id).expect(200);
      const lotada = await alocar(alunos[3].id).expect(409);

      expect(lotada.body.message).toBe(
        'Rota lotada: o veículo comporta 3 alunos.',
      );
      expect(
        (
          await prisma.student.findUniqueOrThrow({
            where: { id: alunos[3].id },
          })
        ).routeId,
      ).toBeNull();

      // Tira o primeiro (routeId: null): a vaga volta e o 4º entra.
      await api(app, token)
        .patch(`/students/${alunos[0].id}/route`)
        .send({ routeId: null })
        .expect(200);
      await alocar(alunos[3].id).expect(200);
      const detalhe = await api(app, token)
        .get(`/routes/${rota.id}`)
        .expect(200);
      expect(detalhe.body.studentsCount).toBe(3);
    });

    it('aluno inativo não ocupa lugar na conta da capacidade', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const { rota, ponto } = await rotaComVagas(1);
      await f.aluno({ routeId: rota.id, stopId: ponto.id, active: false });
      const aluno = await f.aluno();

      await api(app, token)
        .patch(`/students/${aluno.id}/route`)
        .send({ routeId: rota.id, stopId: ponto.id })
        .expect(200);
    });

    it('trocar de ponto na mesma rota lotada é permitido (não ocupa vaga nova)', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const { rota, ponto } = await rotaComVagas(1);
      const outroPonto = await f.ponto(rota.id);
      const aluno = await f.aluno({ routeId: rota.id, stopId: ponto.id });

      const res = await api(app, token)
        .patch(`/students/${aluno.id}/route`)
        .send({ routeId: rota.id, stopId: outroPonto.id })
        .expect(200);

      expect(res.body.stop.id).toBe(outroPonto.id);
    });

    it('mudar de rota libera a vaga da rota antiga', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const a = await rotaComVagas(1);
      const b = await rotaComVagas(5);
      const aluno = await f.aluno({ routeId: a.rota.id, stopId: a.ponto.id });
      const outro = await f.aluno();

      await api(app, token)
        .patch(`/students/${aluno.id}/route`)
        .send({ routeId: b.rota.id, stopId: b.ponto.id })
        .expect(200);

      await api(app, token)
        .patch(`/students/${outro.id}/route`)
        .send({ routeId: a.rota.id, stopId: a.ponto.id })
        .expect(200);
    });

    it('retirar quem não está em rota é permitido (idempotente); o ponto é ignorado', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const aluno = await f.aluno();

      const res = await api(app, token)
        .patch(`/students/${aluno.id}/route`)
        .send({ routeId: null, stopId: 'qualquer-coisa' })
        .expect(200);

      expect(res.body).toMatchObject({ route: null, stop: null });
    });

    it('rota sem veículo -> 409 (a capacidade é desconhecida)', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const rota = await f.rota();
      const ponto = await f.ponto(rota.id);
      const aluno = await f.aluno();

      const res = await api(app, token)
        .patch(`/students/${aluno.id}/route`)
        .send({ routeId: rota.id, stopId: ponto.id })
        .expect(409);

      expect(res.body.message).toContain('não tem veículo');
    });

    it('rota inativa -> 409; rota ativa aceita', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const { rota, ponto } = await rotaComVagas(5);
      const aluno = await f.aluno();

      await prisma.route.update({
        where: { id: rota.id },
        data: { status: RouteStatus.INACTIVE },
      });
      await api(app, token)
        .patch(`/students/${aluno.id}/route`)
        .send({ routeId: rota.id, stopId: ponto.id })
        .expect(409);
      await prisma.route.update({
        where: { id: rota.id },
        data: { status: RouteStatus.ACTIVE },
      });
      await api(app, token)
        .patch(`/students/${aluno.id}/route`)
        .send({ routeId: rota.id, stopId: ponto.id })
        .expect(200);
    });

    it('ponto de OUTRA rota -> 409; ponto inexistente -> 404', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const { rota } = await rotaComVagas(5);
      const outra = await rotaComVagas(5);
      const aluno = await f.aluno();

      await api(app, token)
        .patch(`/students/${aluno.id}/route`)
        .send({ routeId: rota.id, stopId: outra.ponto.id })
        .expect(409);
      await api(app, token)
        .patch(`/students/${aluno.id}/route`)
        .send({ routeId: rota.id, stopId: UUID_INEXISTENTE })
        .expect(404);
    });

    it('referências inexistentes: rota -> 404, aluno -> 404', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const { rota, ponto } = await rotaComVagas(5);
      const aluno = await f.aluno();

      await api(app, token)
        .patch(`/students/${aluno.id}/route`)
        .send({ routeId: UUID_INEXISTENTE, stopId: ponto.id })
        .expect(404);
      await api(app, token)
        .patch(`/students/${UUID_INEXISTENTE}/route`)
        .send({ routeId: rota.id, stopId: ponto.id })
        .expect(404);
      await api(app, token)
        .patch(`/students/${UUID_INEXISTENTE}/route`)
        .send({ routeId: null })
        .expect(404);
    });

    it('aluno inativo -> 409', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const { rota, ponto } = await rotaComVagas(5);
      const aluno = await f.aluno({ active: false });

      await api(app, token)
        .patch(`/students/${aluno.id}/route`)
        .send({ routeId: rota.id, stopId: ponto.id })
        .expect(409);
    });

    it('aluno a bordo de uma viagem em andamento não muda nem sai da rota (409)', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const { rota, ponto } = await rotaComVagas(5);
      const outra = await rotaComVagas(5);
      const aluno = await f.aluno({ routeId: rota.id, stopId: ponto.id });
      await embarcar(aluno.id, rota.id);

      await api(app, token)
        .patch(`/students/${aluno.id}/route`)
        .send({ routeId: outra.rota.id, stopId: outra.ponto.id })
        .expect(409);
      await api(app, token)
        .patch(`/students/${aluno.id}/route`)
        .send({ routeId: null })
        .expect(409);
    });

    it.each([
      ['corpo vazio', {}],
      ['rota que não é UUID', { routeId: 'abc', stopId: UUID_INEXISTENTE }],
      ['sem o ponto', { routeId: UUID_INEXISTENTE }],
      ['ponto que não é UUID', { routeId: UUID_INEXISTENTE, stopId: 'abc' }],
      ['rota em número', { routeId: 123, stopId: UUID_INEXISTENTE }],
      ['campo desconhecido', { routeId: null, capacity: 10 }],
    ])('corpo inválido (%s) -> 400', async (_nome, corpo) => {
      const { token } = await como(app, Role.OPERATOR);
      const aluno = await f.aluno();

      await api(app, token)
        .patch(`/students/${aluno.id}/route`)
        .send(corpo)
        .expect(400);
    });
  });

  // ---------------------------------------------------------------------------
  describe('concorrência: a capacidade não é violada por requisições simultâneas', () => {
    it('8 alocações ao mesmo tempo para 3 vagas: exatamente 3 entram e 5 recebem 409', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const { rota, ponto } = await rotaComVagas(3);
      const alunos = await Promise.all(
        Array.from({ length: 8 }, () => f.aluno()),
      );

      const respostas = await Promise.all(
        alunos.map((aluno) =>
          api(app, token)
            .patch(`/students/${aluno.id}/route`)
            .send({ routeId: rota.id, stopId: ponto.id }),
        ),
      );

      const status = respostas.map((r) => r.status).sort((a, b) => a - b);
      expect(status).toEqual([200, 200, 200, 409, 409, 409, 409, 409]);
      expect(await prisma.student.count({ where: { routeId: rota.id } })).toBe(
        3,
      );
    });

    it('a mesma alocação repetida em paralelo não duplica nem consome vagas extras', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const { rota, ponto } = await rotaComVagas(2);
      const aluno = await f.aluno();

      const respostas = await Promise.all(
        Array.from({ length: 5 }, () =>
          api(app, token)
            .patch(`/students/${aluno.id}/route`)
            .send({ routeId: rota.id, stopId: ponto.id }),
        ),
      );

      expect(respostas.every((r) => r.status === 200)).toBe(true);
      expect(await prisma.student.count({ where: { routeId: rota.id } })).toBe(
        1,
      );
    });

    it('reduzir a capacidade do veículo em paralelo com uma alocação: nunca sobram alunos acima da capacidade', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const { veiculo, rota, ponto } = await rotaComVagas(4);
      for (let i = 0; i < 3; i++)
        await f.aluno({ routeId: rota.id, stopId: ponto.id });
      const novo = await f.aluno();

      const [reducao, alocacao] = await Promise.all([
        api(app, token).patch(`/vehicles/${veiculo.id}`).send({ capacity: 3 }),
        api(app, token)
          .patch(`/students/${novo.id}/route`)
          .send({ routeId: rota.id, stopId: ponto.id }),
      ]);

      // Um dos dois vence e o outro recebe 409, dependendo de quem travou a rota primeiro.
      expect([reducao.status, alocacao.status].sort((a, b) => a - b)).toEqual([
        200, 409,
      ]);
      const alunosAtivos = await prisma.student.count({
        where: { routeId: rota.id, active: true },
      });
      const capacidade = (
        await prisma.vehicle.findUniqueOrThrow({ where: { id: veiculo.id } })
      ).capacity;
      expect(alunosAtivos).toBeLessThanOrEqual(capacidade);
    });
  });

  // ---------------------------------------------------------------------------
  describe('consultas por relacionamento', () => {
    it('GET /students/:id/guardians lista os responsáveis e a situação de cada vínculo', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const aluno = await f.aluno();
      await responsavelVinculado(
        aluno.id,
        GuardianRelationStatus.ACTIVE,
        'mae@teste.com',
      );
      await responsavelVinculado(
        aluno.id,
        GuardianRelationStatus.PENDING,
        'pai@teste.com',
      );

      const res = await api(app, token)
        .get(`/students/${aluno.id}/guardians`)
        .expect(200);

      expect(res.body).toHaveLength(2);
      expect(res.body.map((v: { status: string }) => v.status).sort()).toEqual([
        'ACTIVE',
        'PENDING',
      ]);
      expect(res.body[0].guardian.email).toBeDefined();
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);
      await api(app, token)
        .get(`/students/${UUID_INEXISTENTE}/guardians`)
        .expect(404);
    });

    it('GET /me/students mostra só os alunos com vínculo APROVADO do responsável logado', async () => {
      const { rota, ponto } = await rotaComVagas(5);
      const aprovado = await f.aluno({
        name: 'Filho Aprovado',
        routeId: rota.id,
        stopId: ponto.id,
      });
      const pendente = await f.aluno({ name: 'Filho Pendente' });
      const deOutraPessoa = await f.aluno({ name: 'Filho De Outra Pessoa' });
      const { usuario, token } = await responsavelVinculado(
        aprovado.id,
        GuardianRelationStatus.ACTIVE,
      );
      await prisma.guardianRelation.create({
        data: {
          guardianId: usuario.id,
          studentId: pendente.id,
          relationship: Relationship.FATHER,
          status: GuardianRelationStatus.PENDING,
        },
      });
      await responsavelVinculado(
        deOutraPessoa.id,
        GuardianRelationStatus.ACTIVE,
        'outra@teste.com',
      );

      const res = await api(app, token).get('/me/students').expect(200);

      expect(res.body.map((a: { name: string }) => a.name)).toEqual([
        'Filho Aprovado',
      ]);
      expect(res.body[0]).toMatchObject({
        route: { id: rota.id },
        stop: { id: ponto.id },
      });
    });
  });
});
