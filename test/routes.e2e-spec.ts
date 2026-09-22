import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import {
  Role,
  RouteStatus,
  Shift,
  TripStatus,
  VehicleStatus,
} from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { apontarCepPara, enderecoSe, iniciarCepMock } from './cep-mock.js';
import { api, como, createApp, limparBanco, login } from './create-app.js';
import { fabricas, ontem } from './factories.js';

const UUID_INEXISTENTE = '00000000-0000-7000-8000-000000000000';

describe('Rotas, pontos e integração de CEP', () => {
  let app: INestApplication;
  let f: ReturnType<typeof fabricas>;
  let cep: Awaited<ReturnType<typeof iniciarCepMock>>;

  /** Motorista (com perfil) já autenticado. */
  async function comoMotorista() {
    const motorista = await f.motorista();
    return { motorista, token: await login(app, motorista.user.email) };
  }

  /** Rota completa (veículo, motorista e um ponto), pronta para ser ativada. */
  async function rotaPronta(extra: Record<string, unknown> = {}) {
    const veiculo = await f.veiculo();
    const motorista = await f.motorista();
    const rota = await f.rota({
      vehicleId: veiculo.id,
      driverId: motorista.id,
      ...extra,
    });
    await f.ponto(rota.id);
    return { veiculo, motorista, rota };
  }

  beforeAll(async () => {
    app = await createApp();
    f = fabricas(app);
    cep = await iniciarCepMock();
    apontarCepPara(app, cep.url);
  });
  beforeEach(async () => {
    await limparBanco(app);
    cep.restaurar();
  });
  afterAll(async () => {
    await limparBanco(app);
    await cep.fechar();
    await app.close();
  });

  // ---------------------------------------------------------------------------
  describe('permissões', () => {
    it('GUARDIAN não acessa rotas, pontos nem "minhas rotas" -> 403', async () => {
      const { token } = await como(app, Role.GUARDIAN);
      const rota = await f.rota();

      await api(app, token).get('/routes').expect(403);
      await api(app, token)
        .post('/routes')
        .send({ name: 'X', shift: 'MORNING' })
        .expect(403);
      await api(app, token).get(`/routes/${rota.id}`).expect(403);
      await api(app, token).get(`/routes/${rota.id}/stops`).expect(403);
      await api(app, token).get(`/routes/${rota.id}/students`).expect(403);
      await api(app, token).get('/me/routes').expect(403);
    });

    it('DRIVER lê, mas não altera: POST/PATCH/activate/deactivate/stops -> 403', async () => {
      const { motorista, token } = await comoMotorista();
      const rota = await f.rota({ driverId: motorista.id });

      await api(app, token)
        .post('/routes')
        .send({ name: 'Nova', shift: 'MORNING' })
        .expect(403);
      await api(app, token)
        .patch(`/routes/${rota.id}`)
        .send({ name: 'Outro' })
        .expect(403);
      await api(app, token).post(`/routes/${rota.id}/activate`).expect(403);
      await api(app, token).post(`/routes/${rota.id}/deactivate`).expect(403);
      await api(app, token)
        .post(`/routes/${rota.id}/stops`)
        .send({ cep: '01001000', number: '1' })
        .expect(403);
      await api(app, token)
        .delete(`/routes/${rota.id}/stops/${UUID_INEXISTENTE}`)
        .expect(403);
      expect(cep.consultas).toHaveLength(0);
    });

    it('DRIVER só vê as rotas que conduz (lista, detalhe, pontos, alunos e /me/routes)', async () => {
      const { motorista, token } = await comoMotorista();
      const outroMotorista = await f.motorista();
      const minha = await f.rota({ driverId: motorista.id, name: 'Minha' });
      const alheia = await f.rota({
        driverId: outroMotorista.id,
        name: 'Alheia',
      });
      await f.rota({ name: 'Sem motorista' });
      await f.ponto(minha.id);

      const lista = await api(app, token).get('/routes').expect(200);
      const minhas = await api(app, token).get('/me/routes').expect(200);
      expect(lista.body.total).toBe(1);
      expect(lista.body.data[0].name).toBe('Minha');
      expect(minhas.body.map((r: { name: string }) => r.name)).toEqual([
        'Minha',
      ]);

      await api(app, token).get(`/routes/${minha.id}`).expect(200);
      await api(app, token).get(`/routes/${minha.id}/stops`).expect(200);
      await api(app, token).get(`/routes/${minha.id}/students`).expect(200);
      // Rotas de terceiros: 403 (existem, mas não são dele).
      await api(app, token).get(`/routes/${alheia.id}`).expect(403);
      await api(app, token).get(`/routes/${alheia.id}/stops`).expect(403);
      await api(app, token).get(`/routes/${alheia.id}/students`).expect(403);
    });

    it('OPERATOR não usa /me/routes (é do motorista) -> 403', async () => {
      const { token } = await como(app, Role.OPERATOR);

      await api(app, token).get('/me/routes').expect(403);
    });

    it('motorista não vê o e-mail de outro motorista nas rotas (só id e nome)', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const motorista = await f.motorista();
      await f.rota({ driverId: motorista.id });

      const res = await api(app, token).get('/routes').expect(200);

      expect(res.body.data[0].driver.user).toEqual({
        id: motorista.userId,
        name: motorista.user.name,
      });
      expect(JSON.stringify(res.body)).not.toMatch(/email|passwordHash/);
    });
  });

  // ---------------------------------------------------------------------------
  describe('POST /routes', () => {
    it('cria a rota em rascunho, sem veículo nem motorista', async () => {
      const { token } = await como(app, Role.OPERATOR);

      const res = await api(app, token)
        .post('/routes')
        .send({ name: '  Centro  ', shift: 'MORNING' })
        .expect(201);

      expect(res.body).toMatchObject({
        name: 'Centro',
        shift: 'MORNING',
        status: 'DRAFT',
        vehicle: null,
        driver: null,
        stopsCount: 0,
        studentsCount: 0,
      });
    });

    it('cria já com veículo e motorista (devolve os dados básicos deles)', async () => {
      const { token } = await como(app, Role.ADMIN);
      const veiculo = await f.veiculo({ capacity: 12 });
      const motorista = await f.motorista();

      const res = await api(app, token)
        .post('/routes')
        .send({
          name: 'Norte',
          shift: 'AFTERNOON',
          vehicleId: veiculo.id,
          driverId: motorista.id,
        })
        .expect(201);

      expect(res.body.vehicle).toMatchObject({ id: veiculo.id, capacity: 12 });
      expect(res.body.driver).toMatchObject({ id: motorista.id });
    });

    it('nome repetido no mesmo turno -> 409; em outro turno pode', async () => {
      const { token } = await como(app, Role.OPERATOR);
      await api(app, token)
        .post('/routes')
        .send({ name: 'Centro', shift: 'MORNING' })
        .expect(201);

      const repetida = await api(app, token)
        .post('/routes')
        .send({ name: 'Centro', shift: 'MORNING' })
        .expect(409);
      await api(app, token)
        .post('/routes')
        .send({ name: 'Centro', shift: 'AFTERNOON' })
        .expect(201);

      expect(repetida.body.message).toBe(
        'Já existe uma rota com este nome neste turno.',
      );
    });

    it('veículo ou motorista inexistente -> 404', async () => {
      const { token } = await como(app, Role.OPERATOR);

      await api(app, token)
        .post('/routes')
        .send({ name: 'Rota A', shift: 'MORNING', vehicleId: UUID_INEXISTENTE })
        .expect(404);
      await api(app, token)
        .post('/routes')
        .send({ name: 'Rota B', shift: 'MORNING', driverId: UUID_INEXISTENTE })
        .expect(404);
    });

    it('recusa veículo fora de operação, motorista inativo e CNH vencida (409)', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const emManutencao = await f.veiculo({
        status: VehicleStatus.MAINTENANCE,
      });
      const inativo = await f.motorista({ active: false });
      const cnhVencida = await f.motorista({ licenseExpiresAt: ontem() });

      await api(app, token)
        .post('/routes')
        .send({ name: 'Rota A', shift: 'MORNING', vehicleId: emManutencao.id })
        .expect(409);
      await api(app, token)
        .post('/routes')
        .send({ name: 'Rota B', shift: 'MORNING', driverId: inativo.id })
        .expect(409);
      const res = await api(app, token)
        .post('/routes')
        .send({ name: 'Rota C', shift: 'MORNING', driverId: cnhVencida.id })
        .expect(409);
      expect(res.body.message).toContain('CNH');
    });

    it.each([
      ['conta inativa', { active: false }],
      ['papel diferente de DRIVER', { role: Role.GUARDIAN }],
    ])(
      'recusa motorista com %s, ao criar a rota e ao trocar o motorista (409)',
      async (_nome, alteracao) => {
        const { token } = await como(app, Role.OPERATOR);
        const motorista = await f.motorista();
        await app
          .get(PrismaService)
          .user.update({ where: { id: motorista.userId }, data: alteracao });
        const rota = await f.rota();

        await api(app, token)
          .post('/routes')
          .send({ name: 'Rota Nova', shift: 'MORNING', driverId: motorista.id })
          .expect(409);
        await api(app, token)
          .patch(`/routes/${rota.id}`)
          .send({ driverId: motorista.id })
          .expect(409);
      },
    );

    it.each([
      ['nome curto', { name: 'A', shift: 'MORNING' }],
      ['turno inexistente', { name: 'Centro', shift: 'MADRUGADA' }],
      ['sem turno', { name: 'Centro' }],
      [
        'vehicleId inválido',
        { name: 'Centro', shift: 'MORNING', vehicleId: 'abc' },
      ],
      [
        'status no corpo (rota sempre nasce em rascunho)',
        { name: 'Centro', shift: 'MORNING', status: 'ACTIVE' },
      ],
      ['corpo vazio', {}],
    ])('corpo inválido (%s) -> 400', async (_nome, corpo) => {
      const { token } = await como(app, Role.OPERATOR);

      await api(app, token).post('/routes').send(corpo).expect(400);
    });
  });

  // ---------------------------------------------------------------------------
  describe('GET /routes e GET /routes/:id', () => {
    it('lista com paginação e filtros de situação e turno', async () => {
      const { token } = await como(app, Role.OPERATOR);
      await f.rota({ name: 'A', shift: Shift.MORNING });
      await f.rota({ name: 'B', shift: Shift.AFTERNOON });
      await f.rota({
        name: 'C',
        shift: Shift.MORNING,
        status: RouteStatus.INACTIVE,
      });

      const todas = await api(app, token).get('/routes?limit=2').expect(200);
      const manha = await api(app, token)
        .get('/routes?shift=MORNING')
        .expect(200);
      const inativas = await api(app, token)
        .get('/routes?status=INACTIVE')
        .expect(200);

      expect(todas.body).toMatchObject({ total: 3, limit: 2 });
      expect(todas.body.data).toHaveLength(2);
      expect(manha.body.total).toBe(2);
      expect(inativas.body.total).toBe(1);
      await api(app, token).get('/routes?shift=NOITE').expect(400);
    });

    it('detalhe mostra a lotação (alunos ativos) e a quantidade de pontos', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const veiculo = await f.veiculo({ capacity: 4 });
      const rota = await f.rota({ vehicleId: veiculo.id });
      await f.ponto(rota.id);
      await f.aluno({ routeId: rota.id });
      await f.aluno({ routeId: rota.id });
      await f.aluno({ routeId: rota.id, active: false });

      const res = await api(app, token).get(`/routes/${rota.id}`).expect(200);

      expect(res.body).toMatchObject({ studentsCount: 2, stopsCount: 1 });
      expect(res.body.vehicle.capacity).toBe(4);
    });

    it('404 para rota inexistente e 400 para id inválido', async () => {
      const { token } = await como(app, Role.OPERATOR);

      await api(app, token).get(`/routes/${UUID_INEXISTENTE}`).expect(404);
      await api(app, token).get('/routes/abc').expect(400);
    });
  });

  // ---------------------------------------------------------------------------
  describe('PATCH /routes/:id', () => {
    it('altera nome, turno e troca veículo e motorista', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const rota = await f.rota({ name: 'Antiga' });
      const veiculo = await f.veiculo();
      const motorista = await f.motorista();

      const res = await api(app, token)
        .patch(`/routes/${rota.id}`)
        .send({
          name: 'Nova',
          shift: 'EVENING',
          vehicleId: veiculo.id,
          driverId: motorista.id,
        })
        .expect(200);

      expect(res.body).toMatchObject({ name: 'Nova', shift: 'EVENING' });
      expect(res.body.vehicle.id).toBe(veiculo.id);
    });

    it('em rascunho, veículo e motorista podem ser retirados (null)', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const veiculo = await f.veiculo();
      const rota = await f.rota({ vehicleId: veiculo.id });

      const res = await api(app, token)
        .patch(`/routes/${rota.id}`)
        .send({ vehicleId: null })
        .expect(200);

      expect(res.body.vehicle).toBeNull();
    });

    it('rota ativa não pode ficar sem veículo ou sem motorista (409)', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const { rota } = await rotaPronta({ status: RouteStatus.ACTIVE });

      await api(app, token)
        .patch(`/routes/${rota.id}`)
        .send({ vehicleId: null })
        .expect(409);
      await api(app, token)
        .patch(`/routes/${rota.id}`)
        .send({ driverId: null })
        .expect(409);
    });

    it('não troca por um veículo menor que a lotação (409)', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const grande = await f.veiculo({ capacity: 10 });
      const pequeno = await f.veiculo({ capacity: 2 });
      const rota = await f.rota({ vehicleId: grande.id });
      for (let i = 0; i < 3; i++) await f.aluno({ routeId: rota.id });

      const res = await api(app, token)
        .patch(`/routes/${rota.id}`)
        .send({ vehicleId: pequeno.id })
        .expect(409);

      expect(res.body.message).toContain('comporta 2');
    });

    it('renomear para um nome que já existe no turno -> 409', async () => {
      const { token } = await como(app, Role.OPERATOR);
      await f.rota({ name: 'Centro', shift: Shift.MORNING });
      const outra = await f.rota({ name: 'Norte', shift: Shift.MORNING });

      await api(app, token)
        .patch(`/routes/${outra.id}`)
        .send({ name: 'Centro' })
        .expect(409);
      // Reenviar o próprio nome não é conflito consigo mesma.
      await api(app, token)
        .patch(`/routes/${outra.id}`)
        .send({ name: 'Norte' })
        .expect(200);
    });

    it.each([
      ['status', { status: 'ACTIVE' }],
      ['turno inexistente', { shift: 'NOITE' }],
      ['vehicleId inválido', { vehicleId: 'abc' }],
    ])('PATCH com %s -> 400', async (_nome, corpo) => {
      const { token } = await como(app, Role.OPERATOR);
      const rota = await f.rota();

      await api(app, token).patch(`/routes/${rota.id}`).send(corpo).expect(400);
    });

    it('404 para rota, veículo ou motorista inexistente', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const rota = await f.rota();

      await api(app, token)
        .patch(`/routes/${UUID_INEXISTENTE}`)
        .send({ name: 'X1' })
        .expect(404);
      await api(app, token)
        .patch(`/routes/${rota.id}`)
        .send({ vehicleId: UUID_INEXISTENTE })
        .expect(404);
      await api(app, token)
        .patch(`/routes/${rota.id}`)
        .send({ driverId: UUID_INEXISTENTE })
        .expect(404);
    });
  });

  // ---------------------------------------------------------------------------
  describe('fluxo de estados: DRAFT -> ACTIVE <-> INACTIVE', () => {
    it('percorre o fluxo completo e rejeita as transições inválidas', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const { rota } = await rotaPronta();

      // Estado inicial: DRAFT. Desativar quem não está ativa é incompatível.
      expect(
        (await api(app, token).get(`/routes/${rota.id}`)).body.status,
      ).toBe('DRAFT');
      await api(app, token).post(`/routes/${rota.id}/deactivate`).expect(409);

      const ativa = await api(app, token)
        .post(`/routes/${rota.id}/activate`)
        .expect(200);
      expect(ativa.body.status).toBe('ACTIVE');
      await api(app, token).post(`/routes/${rota.id}/activate`).expect(409); // já ativa

      const inativa = await api(app, token)
        .post(`/routes/${rota.id}/deactivate`)
        .expect(200);
      expect(inativa.body.status).toBe('INACTIVE');
      await api(app, token).post(`/routes/${rota.id}/deactivate`).expect(409); // já inativa

      const reativada = await api(app, token)
        .post(`/routes/${rota.id}/activate`)
        .expect(200);
      expect(reativada.body.status).toBe('ACTIVE');
    });

    it('rota vazia: o 409 lista tudo o que falta para ativar', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const rota = await f.rota();

      const res = await api(app, token)
        .post(`/routes/${rota.id}/activate`)
        .expect(409);

      expect(res.body.message).toContain('não tem veículo');
      expect(res.body.message).toContain('não tem motorista');
      expect(res.body.message).toContain('não tem nenhum ponto');
    });

    it.each([
      [
        'veículo fora de operação',
        async (f: ReturnType<typeof fabricas>) => ({
          vehicleId: (await f.veiculo({ status: VehicleStatus.MAINTENANCE }))
            .id,
          driverId: (await f.motorista()).id,
        }),
        'o veículo não está ativo',
      ],
      [
        'motorista inativo',
        async (f: ReturnType<typeof fabricas>) => ({
          vehicleId: (await f.veiculo()).id,
          driverId: (await f.motorista({ active: false })).id,
        }),
        'o motorista está inativo',
      ],
      [
        'conta do motorista inativa',
        async (f: ReturnType<typeof fabricas>) => {
          const motorista = await f.motorista();
          await app.get(PrismaService).user.update({
            where: { id: motorista.userId },
            data: { active: false },
          });
          return { vehicleId: (await f.veiculo()).id, driverId: motorista.id };
        },
        'o motorista está inativo',
      ],
      [
        'usuário do motorista sem o papel DRIVER',
        async (f: ReturnType<typeof fabricas>) => {
          const motorista = await f.motorista();
          await app.get(PrismaService).user.update({
            where: { id: motorista.userId },
            data: { role: Role.GUARDIAN },
          });
          return { vehicleId: (await f.veiculo()).id, driverId: motorista.id };
        },
        'não tem o papel DRIVER',
      ],
      [
        'CNH vencida',
        async (f: ReturnType<typeof fabricas>) => ({
          vehicleId: (await f.veiculo()).id,
          driverId: (await f.motorista({ licenseExpiresAt: ontem() })).id,
        }),
        'a CNH do motorista está vencida',
      ],
    ])('recusa ativar com %s (409)', async (_nome, montar, mensagem) => {
      const { token } = await como(app, Role.OPERATOR);
      const rota = await f.rota(await montar(f));
      await f.ponto(rota.id);

      const res = await api(app, token)
        .post(`/routes/${rota.id}/activate`)
        .expect(409);

      expect(res.body.message).toContain(mensagem);
    });

    it('não desativa uma rota com viagem em andamento (409)', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const { rota } = await rotaPronta({ status: RouteStatus.ACTIVE });
      const viagem = await app
        .get(PrismaService)
        .trip.create({ data: { routeId: rota.id } });

      const res = await api(app, token)
        .post(`/routes/${rota.id}/deactivate`)
        .expect(409);
      expect(res.body.message).toContain('viagem em andamento');

      // Finalizada a viagem, a rota pode ser desativada.
      await app.get(PrismaService).trip.update({
        where: { id: viagem.id },
        data: { status: TripStatus.FINISHED, finishedAt: new Date() },
      });
      await api(app, token).post(`/routes/${rota.id}/deactivate`).expect(200);
    });

    it('404 e 400 nas ações de status', async () => {
      const { token } = await como(app, Role.OPERATOR);

      await api(app, token)
        .post(`/routes/${UUID_INEXISTENTE}/activate`)
        .expect(404);
      await api(app, token)
        .post(`/routes/${UUID_INEXISTENTE}/deactivate`)
        .expect(404);
      await api(app, token).post('/routes/abc/activate').expect(400);
    });
  });

  // ---------------------------------------------------------------------------
  describe('GET /routes/:id/students', () => {
    it('lista só os alunos ativos da rota, com o ponto de cada um', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const rota = await f.rota();
      const ponto = await f.ponto(rota.id, { position: 1, name: 'Padaria' });
      await f.aluno({ name: 'Bruno', routeId: rota.id, stopId: ponto.id });
      await f.aluno({ name: 'Ana', routeId: rota.id, stopId: ponto.id });
      await f.aluno({ name: 'Inativo', routeId: rota.id, active: false });
      await f.aluno({ name: 'De outra rota' });

      const res = await api(app, token)
        .get(`/routes/${rota.id}/students`)
        .expect(200);

      expect(res.body.map((a: { name: string }) => a.name)).toEqual([
        'Ana',
        'Bruno',
      ]);
      expect(res.body[0].stop.name).toBe('Padaria');
      await api(app, token)
        .get(`/routes/${UUID_INEXISTENTE}/students`)
        .expect(404);
    });
  });

  // ---------------------------------------------------------------------------
  describe('POST /routes/:id/stops (integração com a API de CEP)', () => {
    it('cria o ponto com endereço e coordenadas vindos do serviço externo', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const rota = await f.rota();

      const res = await api(app, token)
        .post(`/routes/${rota.id}/stops`)
        .send({
          cep: '01001-000',
          number: '100',
          complement: 'Bloco B',
          name: 'Em frente à igreja',
        })
        .expect(201);

      expect(res.body).toMatchObject({
        routeId: rota.id,
        position: 1,
        cep: '01001000',
        street: 'Praça da Sé',
        number: '100',
        complement: 'Bloco B',
        neighborhood: 'Sé',
        city: 'São Paulo',
        state: 'SP',
        latitude: -23.5503898, // o serviço manda TEXTO; a API guarda número
        longitude: -46.633081,
        name: 'Em frente à igreja',
      });
      // Só o CEP normalizado (8 dígitos) chegou ao serviço externo.
      expect(cep.consultas).toEqual(['/01001000']);
    });

    it('as posições crescem na ordem de criação', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const rota = await f.rota();

      const primeiro = await api(app, token)
        .post(`/routes/${rota.id}/stops`)
        .send({ cep: '01001000', number: '1' })
        .expect(201);
      const segundo = await api(app, token)
        .post(`/routes/${rota.id}/stops`)
        .send({ cep: '01001000', number: '2' })
        .expect(201);

      expect([primeiro.body.position, segundo.body.position]).toEqual([1, 2]);
    });

    it('5 pontos criados ao mesmo tempo recebem posições distintas (1 a 5)', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const rota = await f.rota();

      const respostas = await Promise.all(
        [1, 2, 3, 4, 5].map((n) =>
          api(app, token)
            .post(`/routes/${rota.id}/stops`)
            .send({ cep: '01001000', number: String(n) }),
        ),
      );

      expect(respostas.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
      expect(
        respostas.map((r) => r.body.position).sort((a, b) => a - b),
      ).toEqual([1, 2, 3, 4, 5]);
    });

    it.each([
      ['sem coordenadas', { location: { coordinates: {} } }],
      ['sem o campo location', { location: undefined }],
      ['só a latitude', { location: { coordinates: { latitude: '-23.5' } } }],
      [
        'latitude fora da faixa',
        { location: { coordinates: { latitude: '999', longitude: '-46.6' } } },
      ],
      [
        'coordenadas em branco',
        { location: { coordinates: { latitude: '', longitude: '' } } },
      ],
      [
        'coordenadas que não são números',
        { location: { coordinates: { latitude: 'abc', longitude: 'xyz' } } },
      ],
    ])(
      'CEP sem coordenadas utilizáveis (%s): o ponto é criado com latitude e longitude nulas',
      async (_nome, alteracao) => {
        const { token } = await como(app, Role.OPERATOR);
        const rota = await f.rota();
        cep.definir({ corpo: { ...enderecoSe(), ...alteracao } });

        const res = await api(app, token)
          .post(`/routes/${rota.id}/stops`)
          .send({ cep: '01001000', number: '1' })
          .expect(201);

        expect(res.body.latitude).toBeNull();
        expect(res.body.longitude).toBeNull();
        expect(res.body.street).toBe('Praça da Sé');
      },
    );

    it('CEP inexistente no serviço externo -> 404 e nada é gravado', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const rota = await f.rota();
      cep.definir({ status: 404, corpo: { message: 'CEP não encontrado' } });

      const res = await api(app, token)
        .post(`/routes/${rota.id}/stops`)
        .send({ cep: '99999999', number: '1' })
        .expect(404);

      expect(res.body.message).toBe('CEP não encontrado.');
      expect(await app.get(PrismaService).routeStop.count()).toBe(0);
    });

    it.each([500, 502, 503])(
      'serviço externo respondeu %i -> 502 controlado',
      async (status) => {
        const { token } = await como(app, Role.OPERATOR);
        const rota = await f.rota();
        cep.definir({ status, corpo: { erro: 'falhou' } });

        const res = await api(app, token)
          .post(`/routes/${rota.id}/stops`)
          .send({ cep: '01001000', number: '1' })
          .expect(502);

        expect(res.body.message).toBe('O serviço de CEP retornou um erro.');
        expect(await app.get(PrismaService).routeStop.count()).toBe(0);
      },
    );

    it.each([
      ['HTML no lugar de JSON', { textoBruto: '<html>erro</html>' }],
      ['JSON que não é um objeto', { corpo: 'texto solto' }],
      ['lista no lugar de objeto', { corpo: [1, 2, 3] }],
      ['sem cidade', { corpo: { ...enderecoSe(), city: '' } }],
      ['estado inválido', { corpo: { ...enderecoSe(), state: 'São Paulo' } }],
    ])(
      'resposta fora do formato (%s) -> 502 controlado',
      async (_nome, comportamento) => {
        const { token } = await como(app, Role.OPERATOR);
        const rota = await f.rota();
        cep.definir(comportamento);

        const res = await api(app, token)
          .post(`/routes/${rota.id}/stops`)
          .send({ cep: '01001000', number: '1' })
          .expect(502);

        expect(res.body.message).toBe('Resposta inválida do serviço de CEP.');
      },
    );

    it('serviço externo lento demais -> 504 (tempo esgotado)', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const rota = await f.rota();
      cep.definir({ atrasoMs: 1500 }); // timeout configurado nos testes: 300 ms

      const res = await api(app, token)
        .post(`/routes/${rota.id}/stops`)
        .send({ cep: '01001000', number: '1' })
        .expect(504);

      expect(res.body.message).toBe(
        'Tempo esgotado ao consultar o serviço de CEP.',
      );
      expect(await app.get(PrismaService).routeStop.count()).toBe(0);
    });

    it('serviço externo fora do ar (conexão recusada) -> 502', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const rota = await f.rota();
      // Descobre uma porta que ninguém está escutando.
      const morto = createServer();
      await new Promise<void>((ok) => morto.listen(0, '127.0.0.1', ok));
      const { port } = morto.address() as AddressInfo;
      await new Promise<void>((ok) => morto.close(() => ok()));

      apontarCepPara(app, `http://127.0.0.1:${port}`);
      try {
        const res = await api(app, token)
          .post(`/routes/${rota.id}/stops`)
          .send({ cep: '01001000', number: '1' })
          .expect(502);
        expect(res.body.message).toBe('Serviço de CEP indisponível.');
      } finally {
        apontarCepPara(app, cep.url);
      }
    });

    it.each([
      ['curto', '123'],
      ['com letras', 'abcdefgh'],
      ['hífen no lugar errado', '0100-1000'],
      ['dígitos a mais', '0100100000'],
      ['vazio', ''],
    ])(
      'CEP inválido (%s) -> 400 SEM consultar o serviço externo',
      async (_nome, valor) => {
        const { token } = await como(app, Role.OPERATOR);
        const rota = await f.rota();

        await api(app, token)
          .post(`/routes/${rota.id}/stops`)
          .send({ cep: valor, number: '1' })
          .expect(400);

        expect(cep.consultas).toHaveLength(0);
      },
    );

    it('CEP sem logradouro/bairro exige que sejam informados no corpo', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const rota = await f.rota();
      cep.definir({ corpo: { ...enderecoSe(), street: '', neighborhood: '' } });

      const semDados = await api(app, token)
        .post(`/routes/${rota.id}/stops`)
        .send({ cep: '01001000', number: '1' })
        .expect(400);
      const comDados = await api(app, token)
        .post(`/routes/${rota.id}/stops`)
        .send({
          cep: '01001000',
          number: '1',
          street: 'Estrada Velha',
          neighborhood: 'Zona Rural',
        })
        .expect(201);

      expect(semDados.body.message).toContain('street');
      expect(comDados.body).toMatchObject({
        street: 'Estrada Velha',
        neighborhood: 'Zona Rural',
      });
    });

    it('rota inexistente -> 404 sem consultar o serviço externo; id inválido -> 400', async () => {
      const { token } = await como(app, Role.OPERATOR);

      await api(app, token)
        .post(`/routes/${UUID_INEXISTENTE}/stops`)
        .send({ cep: '01001000', number: '1' })
        .expect(404);
      await api(app, token)
        .post('/routes/abc/stops')
        .send({ cep: '01001000', number: '1' })
        .expect(400);
      expect(cep.consultas).toHaveLength(0);
    });

    it.each([
      ['sem número', { cep: '01001000' }],
      ['campo desconhecido', { cep: '01001000', number: '1', latitude: 10 }],
      ['número gigante', { cep: '01001000', number: '12345678901' }],
    ])('corpo inválido (%s) -> 400', async (_nome, corpo) => {
      const { token } = await como(app, Role.OPERATOR);
      const rota = await f.rota();

      await api(app, token)
        .post(`/routes/${rota.id}/stops`)
        .send(corpo)
        .expect(400);
    });
  });

  // ---------------------------------------------------------------------------
  describe('GET e DELETE /routes/:id/stops', () => {
    it('lista os pontos em ordem de posição', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const rota = await f.rota();
      await f.ponto(rota.id, { position: 2, name: 'Segundo' });
      await f.ponto(rota.id, { position: 1, name: 'Primeiro' });

      const res = await api(app, token)
        .get(`/routes/${rota.id}/stops`)
        .expect(200);

      expect(res.body.map((p: { name: string }) => p.name)).toEqual([
        'Primeiro',
        'Segundo',
      ]);
      await api(app, token)
        .get(`/routes/${UUID_INEXISTENTE}/stops`)
        .expect(404);
    });

    it('remove um ponto (204); repetir ou usar ponto de outra rota -> 404', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const rota = await f.rota();
      const outra = await f.rota();
      const ponto = await f.ponto(rota.id);
      const pontoDeOutra = await f.ponto(outra.id);

      await api(app, token)
        .delete(`/routes/${rota.id}/stops/${pontoDeOutra.id}`)
        .expect(404);
      await api(app, token)
        .delete(`/routes/${rota.id}/stops/${ponto.id}`)
        .expect(204);
      await api(app, token)
        .delete(`/routes/${rota.id}/stops/${ponto.id}`)
        .expect(404);
      await api(app, token).delete(`/routes/${rota.id}/stops/abc`).expect(400);
    });

    it('não remove ponto que tem alunos (409)', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const rota = await f.rota();
      const ponto = await f.ponto(rota.id);
      await f.aluno({ routeId: rota.id, stopId: ponto.id });

      const res = await api(app, token)
        .delete(`/routes/${rota.id}/stops/${ponto.id}`)
        .expect(409);

      expect(res.body.message).toContain('alunos');
    });

    it('rota ativa não pode perder o último ponto (409)', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const { rota } = await rotaPronta({ status: RouteStatus.ACTIVE });
      const segundo = await f.ponto(rota.id);
      const pontos = await app
        .get(PrismaService)
        .routeStop.findMany({ where: { routeId: rota.id } });
      const primeiro = pontos.find((p) => p.id !== segundo.id)!;

      await api(app, token)
        .delete(`/routes/${rota.id}/stops/${segundo.id}`)
        .expect(204);
      await api(app, token)
        .delete(`/routes/${rota.id}/stops/${primeiro.id}`)
        .expect(409);
    });
  });
});
