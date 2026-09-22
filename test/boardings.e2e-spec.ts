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

describe('Embarque e desembarque de alunos', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let f: ReturnType<typeof fabricas>;

  /** Rota ATIVA com viagem em andamento e um aluno já alocado nela; motorista autenticado. */
  async function viagemComAluno(dadosAluno: Record<string, unknown> = {}) {
    const veiculo = await f.veiculo();
    const motorista = await f.motorista();
    const rota = await f.rota({
      vehicleId: veiculo.id,
      driverId: motorista.id,
      status: RouteStatus.ACTIVE,
    });
    const ponto = await f.ponto(rota.id);
    const aluno = await f.aluno({
      routeId: rota.id,
      stopId: ponto.id,
      ...dadosAluno,
    });
    const token = await login(app, motorista.user.email);
    const viagem = await prisma.trip.create({ data: { routeId: rota.id } });
    return { veiculo, motorista, rota, ponto, aluno, token, viagem };
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
  describe('POST /trips/:tripId/boardings (embarcar)', () => {
    it('o motorista embarca o aluno da rota (201, status BOARDED)', async () => {
      const { viagem, aluno, token } = await viagemComAluno();

      const res = await api(app, token)
        .post(`/trips/${viagem.id}/boardings`)
        .send({ studentId: aluno.id })
        .expect(201);

      expect(res.body).toMatchObject({
        status: 'BOARDED',
        alightedAt: null,
        student: { id: aluno.id, name: aluno.name },
      });
      expect(res.body.boardedAt).toBeTruthy();
    });

    it('secretaria, admin e motorista de outra rota não embarcam (403)', async () => {
      const { viagem, aluno } = await viagemComAluno();
      const operador = await como(app, Role.OPERATOR);
      const admin = await como(app, Role.ADMIN);
      const outroMotorista = await f.motorista();
      const tokenOutro = await login(app, outroMotorista.user.email);

      for (const token of [operador.token, admin.token, tokenOutro]) {
        await api(app, token)
          .post(`/trips/${viagem.id}/boardings`)
          .send({ studentId: aluno.id })
          .expect(403);
      }
      expect(await prisma.boardingRecord.count()).toBe(0);
    });

    it('viagem finalizada ou inexistente: 409 e 404', async () => {
      const { veiculo, motorista, aluno: alunoBase } = await viagemComAluno();
      const token = await login(app, motorista.user.email);
      const rota2 = await f.rota({
        vehicleId: veiculo.id,
        driverId: motorista.id,
        status: RouteStatus.ACTIVE,
      });
      const ponto2 = await f.ponto(rota2.id);
      const aluno2 = await f.aluno({ routeId: rota2.id, stopId: ponto2.id });
      const finalizada = await prisma.trip.create({
        data: {
          routeId: rota2.id,
          status: 'FINISHED',
          startedAt: new Date(Date.now() - 60_000),
          finishedAt: new Date(),
        },
      });

      await api(app, token)
        .post(`/trips/${finalizada.id}/boardings`)
        .send({ studentId: aluno2.id })
        .expect(409);
      await api(app, token)
        .post(`/trips/${UUID_INEXISTENTE}/boardings`)
        .send({ studentId: alunoBase.id })
        .expect(404);
      await api(app, token)
        .post('/trips/nao-e-uuid/boardings')
        .send({ studentId: alunoBase.id })
        .expect(400);
    });

    it('aluno inativo, aluno de outra rota ou aluno inexistente: 409 e 404', async () => {
      const { rota, viagem, token } = await viagemComAluno();
      const inativo = await f.aluno({ routeId: rota.id, active: false });
      const outraRota = await f.rota();
      const deOutraRota = await f.aluno({ routeId: outraRota.id });
      const semRota = await f.aluno();

      await api(app, token)
        .post(`/trips/${viagem.id}/boardings`)
        .send({ studentId: inativo.id })
        .expect(409);
      await api(app, token)
        .post(`/trips/${viagem.id}/boardings`)
        .send({ studentId: deOutraRota.id })
        .expect(409);
      await api(app, token)
        .post(`/trips/${viagem.id}/boardings`)
        .send({ studentId: semRota.id })
        .expect(409);
      await api(app, token)
        .post(`/trips/${viagem.id}/boardings`)
        .send({ studentId: UUID_INEXISTENTE })
        .expect(404);
      expect(await prisma.boardingRecord.count()).toBe(0);
    });

    it('corpo inválido (sem studentId, UUID malformado, campo extra) -> 400', async () => {
      const { viagem, aluno, token } = await viagemComAluno();

      await api(app, token)
        .post(`/trips/${viagem.id}/boardings`)
        .send({})
        .expect(400);
      await api(app, token)
        .post(`/trips/${viagem.id}/boardings`)
        .send({ studentId: 'abc' })
        .expect(400);
      await api(app, token)
        .post(`/trips/${viagem.id}/boardings`)
        .send({ studentId: aluno.id, status: 'ALIGHTED' })
        .expect(400);
    });

    it('embarcar duas vezes na mesma viagem -> 409 (mesmo depois de desembarcar)', async () => {
      const { viagem, aluno, token } = await viagemComAluno();

      await api(app, token)
        .post(`/trips/${viagem.id}/boardings`)
        .send({ studentId: aluno.id })
        .expect(201);
      const repetido = await api(app, token)
        .post(`/trips/${viagem.id}/boardings`)
        .send({ studentId: aluno.id })
        .expect(409);
      expect(repetido.body.message).toContain('já embarcou');

      const registro = await prisma.boardingRecord.findFirstOrThrow();
      await api(app, token)
        .post(`/boardings/${registro.id}/alight`)
        .expect(200);
      await api(app, token)
        .post(`/trips/${viagem.id}/boardings`)
        .send({ studentId: aluno.id })
        .expect(409);
      expect(await prisma.boardingRecord.count()).toBe(1);
    });

    it('8 embarques simultâneos do mesmo aluno na mesma viagem: só 1 vence', async () => {
      const { viagem, aluno, token } = await viagemComAluno();

      const respostas = await Promise.all(
        Array.from({ length: 8 }, () =>
          api(app, token)
            .post(`/trips/${viagem.id}/boardings`)
            .send({ studentId: aluno.id }),
        ),
      );

      const status = respostas.map((r) => r.status).sort((a, b) => a - b);
      expect(status).toEqual([201, 409, 409, 409, 409, 409, 409, 409]);
      expect(await prisma.boardingRecord.count()).toBe(1);
    });

    it('embarcar e finalizar ao mesmo tempo: nunca finaliza com alguém a bordo', async () => {
      const { viagem, aluno, token } = await viagemComAluno();

      const [embarque, fim] = await Promise.all([
        api(app, token)
          .post(`/trips/${viagem.id}/boardings`)
          .send({ studentId: aluno.id }),
        api(app, token).post(`/trips/${viagem.id}/finish`),
      ]);

      // A trava serializa as duas: uma delas vence (201 ou 200), a outra recebe 409 — nunca as
      // duas passam juntas.
      const vencedores = [embarque.status === 201, fim.status === 200].filter(
        Boolean,
      ).length;
      expect(vencedores).toBe(1);
      expect([embarque.status, fim.status]).toContain(409);

      // Em qualquer ordem, o estado final nunca é "viagem finalizada com alguém a bordo".
      const viagemFinal = await prisma.trip.findUniqueOrThrow({
        where: { id: viagem.id },
      });
      const aBordo = await prisma.boardingRecord.count({
        where: { tripId: viagem.id, status: 'BOARDED' },
      });
      expect(viagemFinal.status === 'FINISHED' && aBordo > 0).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  describe('POST /boardings/:id/alight (desembarcar)', () => {
    async function comAlunoABordo() {
      const cenario = await viagemComAluno();
      const embarque = await api(app, cenario.token)
        .post(`/trips/${cenario.viagem.id}/boardings`)
        .send({ studentId: cenario.aluno.id })
        .expect(201);
      return { ...cenario, boardingId: embarque.body.id as string };
    }

    it('o motorista desembarca (200, status ALIGHTED, alightedAt preenchido)', async () => {
      const { boardingId, token } = await comAlunoABordo();

      const res = await api(app, token)
        .post(`/boardings/${boardingId}/alight`)
        .expect(200);

      expect(res.body.status).toBe('ALIGHTED');
      expect(res.body.alightedAt).toBeTruthy();
      expect(new Date(res.body.alightedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(res.body.boardedAt).getTime(),
      );
    });

    it('secretaria, admin e motorista de outra rota não desembarcam (403)', async () => {
      const { boardingId } = await comAlunoABordo();
      const operador = await como(app, Role.OPERATOR);
      const admin = await como(app, Role.ADMIN);
      const outroMotorista = await f.motorista();
      const tokenOutro = await login(app, outroMotorista.user.email);

      for (const token of [operador.token, admin.token, tokenOutro]) {
        await api(app, token)
          .post(`/boardings/${boardingId}/alight`)
          .expect(403);
      }
      expect(
        (
          await prisma.boardingRecord.findUniqueOrThrow({
            where: { id: boardingId },
          })
        ).status,
      ).toBe('BOARDED');
    });

    it('já desembarcado -> 409', async () => {
      const { boardingId, token } = await comAlunoABordo();

      await api(app, token).post(`/boardings/${boardingId}/alight`).expect(200);
      await api(app, token).post(`/boardings/${boardingId}/alight`).expect(409);
    });

    it('registro inexistente -> 404; id inválido -> 400', async () => {
      const motorista = await f.motorista();
      const token = await login(app, motorista.user.email);

      await api(app, token)
        .post(`/boardings/${UUID_INEXISTENTE}/alight`)
        .expect(404);
      await api(app, token).post('/boardings/nao-e-uuid/alight').expect(400);
    });

    it('5 desembarques simultâneos do mesmo registro: só 1 vence', async () => {
      const { boardingId, token } = await comAlunoABordo();

      const respostas = await Promise.all(
        Array.from({ length: 5 }, () =>
          api(app, token).post(`/boardings/${boardingId}/alight`),
        ),
      );

      const status = respostas.map((r) => r.status).sort((a, b) => a - b);
      expect(status).toEqual([200, 409, 409, 409, 409]);
    });

    it('GUARDIAN não embarca nem desembarca ninguém (403)', async () => {
      const { viagem, aluno } = await viagemComAluno();
      const { token } = await como(app, Role.GUARDIAN);

      await api(app, token)
        .post(`/trips/${viagem.id}/boardings`)
        .send({ studentId: aluno.id })
        .expect(403);
      await api(app, token)
        .post(`/boardings/${UUID_INEXISTENTE}/alight`)
        .expect(403);
    });
  });

  // ---------------------------------------------------------------------------
  describe('fluxo completo: finalizar exige ninguém a bordo', () => {
    it('embarca, tenta finalizar (409), desembarca, finaliza (200)', async () => {
      const { viagem, aluno, token } = await viagemComAluno();

      const embarque = await api(app, token)
        .post(`/trips/${viagem.id}/boardings`)
        .send({ studentId: aluno.id })
        .expect(201);
      const recusado = await api(app, token)
        .post(`/trips/${viagem.id}/finish`)
        .expect(409);
      expect(recusado.body.message).toContain('1 aluno');

      await api(app, token)
        .post(`/boardings/${embarque.body.id}/alight`)
        .expect(200);
      await api(app, token).post(`/trips/${viagem.id}/finish`).expect(200);
    });
  });

  // ---------------------------------------------------------------------------
  describe('GET /trips/:id/boardings (lista de chamada da viagem)', () => {
    it('mostra quem embarcou e quem já desembarcou, em ordem de embarque', async () => {
      const { rota, ponto, viagem, aluno, token } = await viagemComAluno();
      const aluno2 = await f.aluno({ routeId: rota.id, stopId: ponto.id });
      const primeiro = await api(app, token)
        .post(`/trips/${viagem.id}/boardings`)
        .send({ studentId: aluno.id })
        .expect(201);
      await api(app, token)
        .post(`/trips/${viagem.id}/boardings`)
        .send({ studentId: aluno2.id })
        .expect(201);
      await api(app, token)
        .post(`/boardings/${primeiro.body.id}/alight`)
        .expect(200);

      const res = await api(app, token)
        .get(`/trips/${viagem.id}/boardings`)
        .expect(200);

      expect(res.body).toHaveLength(2);
      expect(res.body[0]).toMatchObject({
        status: 'ALIGHTED',
        student: { id: aluno.id },
      });
      expect(res.body[1]).toMatchObject({
        status: 'BOARDED',
        student: { id: aluno2.id },
      });
    });

    it('viagem sem nenhum embarque devolve lista vazia', async () => {
      const { viagem, token } = await viagemComAluno();

      const res = await api(app, token)
        .get(`/trips/${viagem.id}/boardings`)
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('secretaria e admin veem qualquer viagem; motorista de outra rota não (403)', async () => {
      const { viagem } = await viagemComAluno();
      const operador = await como(app, Role.OPERATOR);
      const admin = await como(app, Role.ADMIN);
      const outroMotorista = await f.motorista();
      const tokenOutro = await login(app, outroMotorista.user.email);

      await api(app, operador.token)
        .get(`/trips/${viagem.id}/boardings`)
        .expect(200);
      await api(app, admin.token)
        .get(`/trips/${viagem.id}/boardings`)
        .expect(200);
      await api(app, tokenOutro)
        .get(`/trips/${viagem.id}/boardings`)
        .expect(403);
    });

    it('GUARDIAN não acessa a lista de chamada (403)', async () => {
      const { viagem } = await viagemComAluno();
      const { token } = await como(app, Role.GUARDIAN);

      await api(app, token).get(`/trips/${viagem.id}/boardings`).expect(403);
    });

    it('viagem inexistente -> 404; id inválido -> 400', async () => {
      const { token } = await como(app, Role.OPERATOR);

      await api(app, token)
        .get(`/trips/${UUID_INEXISTENTE}/boardings`)
        .expect(404);
      await api(app, token).get('/trips/nao-e-uuid/boardings').expect(400);
    });
  });

  // ---------------------------------------------------------------------------
  describe('GET /students/:id/boardings (histórico do aluno)', () => {
    /** Aluno com um embarque já concluído (BOARDED depois ALIGHTED) numa viagem finalizada. */
    async function alunoComHistorico() {
      const { rota, viagem, aluno, token } = await viagemComAluno();
      const embarque = await api(app, token)
        .post(`/trips/${viagem.id}/boardings`)
        .send({ studentId: aluno.id })
        .expect(201);
      await api(app, token)
        .post(`/boardings/${embarque.body.id}/alight`)
        .expect(200);
      await api(app, token).post(`/trips/${viagem.id}/finish`).expect(200);
      return { rota, viagem, aluno, token };
    }

    it('secretaria e admin veem o histórico de qualquer aluno', async () => {
      const { aluno, viagem, rota } = await alunoComHistorico();
      const { token } = await como(app, Role.OPERATOR);

      const res = await api(app, token)
        .get(`/students/${aluno.id}/boardings`)
        .expect(200);

      expect(res.body).toMatchObject({ total: 1, page: 1, limit: 20 });
      expect(res.body.data[0]).toMatchObject({
        status: 'ALIGHTED',
        trip: { id: viagem.id, status: 'FINISHED', route: { id: rota.id } },
      });
    });

    it('o motorista da rota atual do aluno vê; motorista de outra rota não (403)', async () => {
      const { aluno, token } = await alunoComHistorico();
      const outroMotorista = await f.motorista();
      const tokenOutro = await login(app, outroMotorista.user.email);

      await api(app, token).get(`/students/${aluno.id}/boardings`).expect(200);
      await api(app, tokenOutro)
        .get(`/students/${aluno.id}/boardings`)
        .expect(403);
    });

    it('o responsável com vínculo ACTIVE vê; sem vínculo, PENDING ou de outro aluno -> 403', async () => {
      const { aluno } = await alunoComHistorico();
      const vinculado = await como(app, Role.GUARDIAN, 'vinculado@teste.com');
      await prisma.guardianRelation.create({
        data: {
          guardianId: vinculado.usuario.id,
          studentId: aluno.id,
          relationship: Relationship.MOTHER,
          status: GuardianRelationStatus.ACTIVE,
        },
      });
      const pendente = await como(app, Role.GUARDIAN, 'pendente@teste.com');
      await prisma.guardianRelation.create({
        data: {
          guardianId: pendente.usuario.id,
          studentId: aluno.id,
          relationship: Relationship.FATHER,
        },
      });
      const semVinculo = await como(app, Role.GUARDIAN, 'estranho@teste.com');

      await api(app, vinculado.token)
        .get(`/students/${aluno.id}/boardings`)
        .expect(200);
      await api(app, pendente.token)
        .get(`/students/${aluno.id}/boardings`)
        .expect(403);
      await api(app, semVinculo.token)
        .get(`/students/${aluno.id}/boardings`)
        .expect(403);
    });

    it('aluno sem nenhum embarque devolve histórico vazio', async () => {
      const aluno = await f.aluno();
      const { token } = await como(app, Role.OPERATOR);

      const res = await api(app, token)
        .get(`/students/${aluno.id}/boardings`)
        .expect(200);

      expect(res.body).toEqual({ data: [], total: 0, page: 1, limit: 20 });
    });

    it('paginação: page/limit funcionam e nunca repetem nem pulam registros', async () => {
      const { rota, viagem, aluno, token } = await viagemComAluno();
      // 3 viagens no total (a da fábrica + 2 novas). Só pode haver 1 viagem em andamento por
      // rota, então cada uma é embarcada, desembarcada e finalizada antes da próxima começar.
      let atual = viagem;
      for (let i = 0; i < 3; i++) {
        if (i > 0)
          atual = await prisma.trip.create({ data: { routeId: rota.id } });
        const embarque = await api(app, token)
          .post(`/trips/${atual.id}/boardings`)
          .send({ studentId: aluno.id })
          .expect(201);
        await api(app, token)
          .post(`/boardings/${embarque.body.id}/alight`)
          .expect(200);
        await api(app, token).post(`/trips/${atual.id}/finish`).expect(200);
      }
      const { token: tokenOperador } = await como(app, Role.OPERATOR);

      const p1 = await api(app, tokenOperador)
        .get(`/students/${aluno.id}/boardings?limit=2&page=1`)
        .expect(200);
      const p2 = await api(app, tokenOperador)
        .get(`/students/${aluno.id}/boardings?limit=2&page=2`)
        .expect(200);

      expect(p1.body).toMatchObject({ total: 3, page: 1, limit: 2 });
      expect(p1.body.data).toHaveLength(2);
      expect(p2.body.data).toHaveLength(1);
      const idsP1 = p1.body.data.map((r: { id: string }) => r.id);
      const idsP2 = p2.body.data.map((r: { id: string }) => r.id);
      expect(new Set([...idsP1, ...idsP2]).size).toBe(3);
    });

    it('aluno inexistente -> 404; id inválido -> 400', async () => {
      const { token } = await como(app, Role.OPERATOR);

      await api(app, token)
        .get(`/students/${UUID_INEXISTENTE}/boardings`)
        .expect(404);
      await api(app, token).get('/students/nao-e-uuid/boardings').expect(400);
    });
  });
});
