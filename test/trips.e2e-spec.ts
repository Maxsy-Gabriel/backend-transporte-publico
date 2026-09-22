import type { INestApplication } from '@nestjs/common';
import { Role, RouteStatus } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { api, como, createApp, limparBanco, login } from './create-app.js';
import { fabricas, ontem } from './factories.js';

const UUID_INEXISTENTE = '00000000-0000-7000-8000-000000000000';

describe('Viagens: iniciar e finalizar', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let f: ReturnType<typeof fabricas>;

  /** Rota ATIVA (veículo, motorista, ponto) com o motorista já autenticado. */
  async function rotaAtivaComMotorista(
    dadosMotorista: Record<string, unknown> = {},
  ) {
    const veiculo = await f.veiculo();
    const motorista = await f.motorista(dadosMotorista);
    const rota = await f.rota({
      vehicleId: veiculo.id,
      driverId: motorista.id,
      status: RouteStatus.ACTIVE,
    });
    await f.ponto(rota.id);
    const token = await login(app, motorista.user.email);
    return { veiculo, motorista, rota, token };
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
  describe('POST /routes/:routeId/trips (iniciar)', () => {
    it('o motorista da rota inicia a viagem (201, status IN_PROGRESS)', async () => {
      const { rota, token } = await rotaAtivaComMotorista();

      const res = await api(app, token)
        .post(`/routes/${rota.id}/trips`)
        .expect(201);

      expect(res.body).toMatchObject({
        status: 'IN_PROGRESS',
        finishedAt: null,
        route: { id: rota.id, name: rota.name },
      });
      expect(res.body.startedAt).toBeTruthy();
    });

    it('secretaria, admin e motorista de outra rota não iniciam (403)', async () => {
      const { rota } = await rotaAtivaComMotorista();
      const operador = await como(app, Role.OPERATOR);
      const admin = await como(app, Role.ADMIN);
      const outroMotorista = await f.motorista();
      const tokenOutro = await login(app, outroMotorista.user.email);

      for (const token of [operador.token, admin.token, tokenOutro]) {
        await api(app, token).post(`/routes/${rota.id}/trips`).expect(403);
      }
      expect(await prisma.trip.count()).toBe(0);
    });

    it('rota em rascunho ou inativa -> 409', async () => {
      const veiculo = await f.veiculo();
      const motorista = await f.motorista();
      const token = await login(app, motorista.user.email);

      const rascunho = await f.rota({
        vehicleId: veiculo.id,
        driverId: motorista.id,
      });
      await api(app, token).post(`/routes/${rascunho.id}/trips`).expect(409);

      const inativa = await f.rota({
        vehicleId: veiculo.id,
        driverId: motorista.id,
        status: RouteStatus.INACTIVE,
      });
      await api(app, token).post(`/routes/${inativa.id}/trips`).expect(409);
    });

    it('CNH vencida DEPOIS da rota ativa -> 409', async () => {
      const { rota, motorista, token } = await rotaAtivaComMotorista();
      await prisma.driver.update({
        where: { id: motorista.id },
        data: { licenseExpiresAt: ontem() },
      });

      const res = await api(app, token)
        .post(`/routes/${rota.id}/trips`)
        .expect(409);
      expect(res.body.message).toContain('CNH');
    });

    it('só uma viagem em andamento por rota (409); depois de finalizada, pode iniciar outra', async () => {
      const { rota, token } = await rotaAtivaComMotorista();

      await api(app, token).post(`/routes/${rota.id}/trips`).expect(201);
      const segunda = await api(app, token)
        .post(`/routes/${rota.id}/trips`)
        .expect(409);
      expect(segunda.body.message).toContain('em andamento');

      await api(app, token)
        .post(`/trips/${(await prisma.trip.findFirstOrThrow()).id}/finish`)
        .expect(200);
      await api(app, token).post(`/routes/${rota.id}/trips`).expect(201);
      expect(await prisma.trip.count()).toBe(2);
    });

    it('5 tentativas de iniciar ao mesmo tempo: exatamente 1 vence', async () => {
      const { rota, token } = await rotaAtivaComMotorista();

      const respostas = await Promise.all(
        Array.from({ length: 5 }, () =>
          api(app, token).post(`/routes/${rota.id}/trips`),
        ),
      );

      const status = respostas.map((r) => r.status).sort((a, b) => a - b);
      expect(status).toEqual([201, 409, 409, 409, 409]);
      expect(await prisma.trip.count()).toBe(1);
    });

    it('rota inexistente -> 404; id inválido -> 400', async () => {
      const motorista = await f.motorista();
      const token = await login(app, motorista.user.email);

      await api(app, token)
        .post(`/routes/${UUID_INEXISTENTE}/trips`)
        .expect(404);
      await api(app, token).post('/routes/nao-e-uuid/trips').expect(400);
    });
  });

  // ---------------------------------------------------------------------------
  describe('POST /trips/:id/finish (finalizar)', () => {
    it('o motorista da rota finaliza (200, status FINISHED, finishedAt preenchido)', async () => {
      const { rota, token } = await rotaAtivaComMotorista();
      await api(app, token).post(`/routes/${rota.id}/trips`).expect(201);
      const viagem = await prisma.trip.findFirstOrThrow();

      const res = await api(app, token)
        .post(`/trips/${viagem.id}/finish`)
        .expect(200);

      expect(res.body).toMatchObject({ status: 'FINISHED' });
      expect(res.body.finishedAt).toBeTruthy();
      expect(new Date(res.body.finishedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(res.body.startedAt).getTime(),
      );
    });

    it('secretaria, admin e motorista de outra rota não finalizam (403)', async () => {
      const { rota, token } = await rotaAtivaComMotorista();
      await api(app, token).post(`/routes/${rota.id}/trips`).expect(201);
      const viagem = await prisma.trip.findFirstOrThrow();
      const operador = await como(app, Role.OPERATOR);
      const admin = await como(app, Role.ADMIN);
      const outroMotorista = await f.motorista();
      const tokenOutro = await login(app, outroMotorista.user.email);

      for (const t of [operador.token, admin.token, tokenOutro]) {
        await api(app, t).post(`/trips/${viagem.id}/finish`).expect(403);
      }
      expect(
        (await prisma.trip.findUniqueOrThrow({ where: { id: viagem.id } }))
          .status,
      ).toBe('IN_PROGRESS');
    });

    it('viagem já finalizada -> 409', async () => {
      const { rota, token } = await rotaAtivaComMotorista();
      await api(app, token).post(`/routes/${rota.id}/trips`).expect(201);
      const viagem = await prisma.trip.findFirstOrThrow();

      await api(app, token).post(`/trips/${viagem.id}/finish`).expect(200);
      await api(app, token).post(`/trips/${viagem.id}/finish`).expect(409);
    });

    it('não finaliza com aluno a bordo (409); some com todos, finaliza (200)', async () => {
      const { rota, token, motorista } = await rotaAtivaComMotorista();
      await api(app, token).post(`/routes/${rota.id}/trips`).expect(201);
      const viagem = await prisma.trip.findFirstOrThrow();
      const aluno = await f.aluno({ routeId: rota.id });
      const registro = await prisma.boardingRecord.create({
        data: {
          tripId: viagem.id,
          studentId: aluno.id,
          registeredById: motorista.userId,
        },
      });

      const recusado = await api(app, token)
        .post(`/trips/${viagem.id}/finish`)
        .expect(409);
      expect(recusado.body.message).toContain('1 aluno');

      await prisma.boardingRecord.update({
        where: { id: registro.id },
        data: { status: 'ALIGHTED', alightedAt: new Date() },
      });
      await api(app, token).post(`/trips/${viagem.id}/finish`).expect(200);
    });

    it('viagem inexistente -> 404; id inválido -> 400', async () => {
      const motorista = await f.motorista();
      const token = await login(app, motorista.user.email);

      await api(app, token)
        .post(`/trips/${UUID_INEXISTENTE}/finish`)
        .expect(404);
      await api(app, token).post('/trips/nao-e-uuid/finish').expect(400);
    });
  });

  // ---------------------------------------------------------------------------
  describe('GET /trips e GET /trips/:id', () => {
    it('secretaria e admin veem todas; o motorista só as das próprias rotas', async () => {
      const a = await rotaAtivaComMotorista();
      const b = await rotaAtivaComMotorista();
      await api(app, a.token).post(`/routes/${a.rota.id}/trips`).expect(201);
      await api(app, b.token).post(`/routes/${b.rota.id}/trips`).expect(201);
      const { token: tokenOperador } = await como(app, Role.OPERATOR);

      const doOperador = await api(app, tokenOperador)
        .get('/trips')
        .expect(200);
      const doMotoristaA = await api(app, a.token).get('/trips').expect(200);

      expect(doOperador.body.total).toBe(2);
      expect(doMotoristaA.body.total).toBe(1);
      expect(doMotoristaA.body.data[0].route.id).toBe(a.rota.id);
    });

    it('filtros por situação e por rota', async () => {
      const { rota, token } = await rotaAtivaComMotorista();
      await api(app, token).post(`/routes/${rota.id}/trips`).expect(201);
      const viagem = await prisma.trip.findFirstOrThrow();
      await api(app, token).post(`/trips/${viagem.id}/finish`).expect(200);
      const { token: tokenOperador } = await como(app, Role.OPERATOR);

      const finalizadas = await api(app, tokenOperador)
        .get('/trips?status=FINISHED')
        .expect(200);
      const emAndamento = await api(app, tokenOperador)
        .get('/trips?status=IN_PROGRESS')
        .expect(200);
      const daRota = await api(app, tokenOperador)
        .get(`/trips?routeId=${rota.id}`)
        .expect(200);

      expect(finalizadas.body.total).toBe(1);
      expect(emAndamento.body.total).toBe(0);
      expect(daRota.body.total).toBe(1);
    });

    it('filtra por período (from/to, AAAA-MM-DD, ambos inclusivos)', async () => {
      const { rota } = await rotaAtivaComMotorista();
      const { token: tokenOperador } = await como(app, Role.OPERATOR);
      // Três viagens já finalizadas, em dias diferentes (gravadas direto no banco: a API não
      // permite escolher a data de início, ela é sempre "agora").
      const viagemEm = (dia: string) =>
        prisma.trip.create({
          data: {
            routeId: rota.id,
            status: 'FINISHED',
            startedAt: new Date(`${dia}T10:00:00Z`),
            finishedAt: new Date(`${dia}T11:00:00Z`),
          },
        });
      await viagemEm('2026-01-05');
      await viagemEm('2026-01-10');
      await viagemEm('2026-01-15');

      const doDia10 = await api(app, tokenOperador)
        .get('/trips?from=2026-01-10&to=2026-01-10')
        .expect(200);
      const ateDia10 = await api(app, tokenOperador)
        .get('/trips?to=2026-01-10')
        .expect(200);
      const de11EmDiante = await api(app, tokenOperador)
        .get('/trips?from=2026-01-11')
        .expect(200);

      expect(doDia10.body.total).toBe(1);
      expect(ateDia10.body.total).toBe(2);
      expect(de11EmDiante.body.total).toBe(1);
    });

    it('from depois de to -> 400; data em formato inválido ou inexistente -> 400', async () => {
      const { token: tokenOperador } = await como(app, Role.OPERATOR);

      await api(app, tokenOperador)
        .get('/trips?from=2026-01-10&to=2026-01-05')
        .expect(400);
      await api(app, tokenOperador).get('/trips?from=10-01-2026').expect(400);
      await api(app, tokenOperador).get('/trips?to=2026-02-30').expect(400);
    });

    it('GET /trips/:id: dono vê (200), motorista de outra rota não (403), inexistente (404), inválido (400)', async () => {
      const { rota, token } = await rotaAtivaComMotorista();
      await api(app, token).post(`/routes/${rota.id}/trips`).expect(201);
      const viagem = await prisma.trip.findFirstOrThrow();
      const outroMotorista = await f.motorista();
      const tokenOutro = await login(app, outroMotorista.user.email);

      await api(app, token).get(`/trips/${viagem.id}`).expect(200);
      await api(app, tokenOutro).get(`/trips/${viagem.id}`).expect(403);
      await api(app, token).get(`/trips/${UUID_INEXISTENTE}`).expect(404);
      await api(app, token).get('/trips/nao-e-uuid').expect(400);
    });

    it('GUARDIAN não acessa nenhuma rota de viagens (403)', async () => {
      const { rota } = await rotaAtivaComMotorista();
      const { token } = await como(app, Role.GUARDIAN);

      await api(app, token).post(`/routes/${rota.id}/trips`).expect(403);
      await api(app, token).get('/trips').expect(403);
      await api(app, token).get(`/trips/${UUID_INEXISTENTE}`).expect(403);
      await api(app, token)
        .post(`/trips/${UUID_INEXISTENTE}/finish`)
        .expect(403);
    });
  });
});
