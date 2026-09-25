import type { INestApplication } from '@nestjs/common';
import {
  Role,
  RouteStatus,
  VehicleStatus,
} from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  api,
  como,
  createApp,
  criarUsuario,
  limparBanco,
  login,
} from './create-app.js';
import { daquiAUmAno, fabricas } from './factories.js';

const UUID_INEXISTENTE = '00000000-0000-7000-8000-000000000000';

describe('Veículos e motoristas (gestão administrativa)', () => {
  let app: INestApplication;
  let f: ReturnType<typeof fabricas>;

  beforeAll(async () => {
    app = await createApp();
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
  describe('/vehicles', () => {
    const novo = { plate: 'ABC1D23', model: 'Van Escolar', capacity: 15 };

    it.each([Role.GUARDIAN, Role.DRIVER])(
      '%s não acessa a gestão de veículos -> 403',
      async (papel) => {
        const { token } = await como(app, papel);
        const veiculo = await f.veiculo();

        await api(app, token).get('/vehicles').expect(403);
        await api(app, token).post('/vehicles').send(novo).expect(403);
        await api(app, token).get(`/vehicles/${veiculo.id}`).expect(403);
        await api(app, token)
          .patch(`/vehicles/${veiculo.id}`)
          .send({ model: 'Outro' })
          .expect(403);
        await api(app, token).get(`/vehicles/${veiculo.id}/routes`).expect(403);
      },
    );

    it.each([Role.OPERATOR, Role.ADMIN])(
      '%s cria veículo (201)',
      async (papel) => {
        const { token } = await como(app, papel);

        const res = await api(app, token)
          .post('/vehicles')
          .send(novo)
          .expect(201);

        expect(res.body).toMatchObject({
          plate: 'ABC1D23',
          model: 'Van Escolar',
          capacity: 15,
          status: 'ACTIVE',
        });
      },
    );

    it.each([
      ['abc-1d23', 'ABC1D23'],
      ['ABC 1234', 'ABC1234'],
      ['  abc1234 ', 'ABC1234'],
    ])('normaliza a placa %j -> %s', async (entrada, esperada) => {
      const { token } = await como(app, Role.OPERATOR);

      const res = await api(app, token)
        .post('/vehicles')
        .send({ ...novo, plate: entrada })
        .expect(201);

      expect(res.body.plate).toBe(esperada);
    });

    it('placa repetida (mesmo escrita de outro jeito) -> 409', async () => {
      const { token } = await como(app, Role.OPERATOR);
      await api(app, token).post('/vehicles').send(novo).expect(201);

      const res = await api(app, token)
        .post('/vehicles')
        .send({ ...novo, plate: 'abc-1d23' })
        .expect(409);

      expect(res.body.message).toBe('Placa já cadastrada.');
    });

    it.each([
      ['placa curta', { ...novo, plate: 'AB123' }],
      ['placa com letras demais', { ...novo, plate: 'ABCD123' }],
      ['placa só números', { ...novo, plate: '1234567' }],
      ['capacidade zero', { ...novo, capacity: 0 }],
      ['capacidade negativa', { ...novo, capacity: -3 }],
      ['capacidade acima do máximo', { ...novo, capacity: 101 }],
      ['capacidade fracionada', { ...novo, capacity: 10.5 }],
      ['capacidade em texto', { ...novo, capacity: '10' }],
      ['modelo curto', { ...novo, model: 'V' }],
      ['situação inexistente', { ...novo, status: 'VOANDO' }],
      ['campo extra', { ...novo, id: UUID_INEXISTENTE }],
      ['corpo vazio', {}],
    ])('corpo inválido (%s) -> 400', async (_nome, corpo) => {
      const { token } = await como(app, Role.OPERATOR);

      await api(app, token).post('/vehicles').send(corpo).expect(400);
    });

    it('lista com paginação e filtro por situação', async () => {
      const { token } = await como(app, Role.OPERATOR);
      await f.veiculo();
      await f.veiculo();
      await f.veiculo({ status: VehicleStatus.MAINTENANCE });

      const todos = await api(app, token).get('/vehicles?limit=2').expect(200);
      const filtrados = await api(app, token)
        .get('/vehicles?status=MAINTENANCE')
        .expect(200);

      expect(todos.body).toMatchObject({ total: 3, page: 1, limit: 2 });
      expect(todos.body.data).toHaveLength(2);
      expect(filtrados.body.total).toBe(1);
      await api(app, token).get('/vehicles?status=VOANDO').expect(400);
    });

    it('GET /vehicles/:id: 200, 404 e 400', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const veiculo = await f.veiculo();

      const res = await api(app, token)
        .get(`/vehicles/${veiculo.id}`)
        .expect(200);
      expect(res.body.plate).toBe(veiculo.plate);
      await api(app, token).get(`/vehicles/${UUID_INEXISTENTE}`).expect(404);
      await api(app, token).get('/vehicles/nao-e-uuid').expect(400);
    });

    it('PATCH altera modelo, capacidade e situação', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const veiculo = await f.veiculo({ capacity: 10 });

      const res = await api(app, token)
        .patch(`/vehicles/${veiculo.id}`)
        .send({ model: 'Micro-ônibus', capacity: 20, status: 'MAINTENANCE' })
        .expect(200);

      expect(res.body).toMatchObject({
        model: 'Micro-ônibus',
        capacity: 20,
        status: 'MAINTENANCE',
      });
    });

    it.each([
      ['a placa (é a identidade do veículo)', { plate: 'XYZ9999' }],
      ['capacidade zero', { capacity: 0 }],
      ['situação inexistente', { status: 'VOANDO' }],
    ])('PATCH com %s -> 400', async (_nome, corpo) => {
      const { token } = await como(app, Role.OPERATOR);
      const veiculo = await f.veiculo();

      await api(app, token)
        .patch(`/vehicles/${veiculo.id}`)
        .send(corpo)
        .expect(400);
    });

    it('PATCH em veículo inexistente -> 404', async () => {
      const { token } = await como(app, Role.OPERATOR);

      await api(app, token)
        .patch(`/vehicles/${UUID_INEXISTENTE}`)
        .send({ model: 'Van' })
        .expect(404);
    });

    it('não reduz a capacidade abaixo dos alunos já alocados nas rotas (409)', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const veiculo = await f.veiculo({ capacity: 5 });
      const rota = await f.rota({ vehicleId: veiculo.id, name: 'Centro' });
      for (let i = 0; i < 3; i++) await f.aluno({ routeId: rota.id });
      await f.aluno({ routeId: rota.id, active: false }); // inativo não ocupa lugar

      const recusado = await api(app, token)
        .patch(`/vehicles/${veiculo.id}`)
        .send({ capacity: 2 })
        .expect(409);
      expect(recusado.body.message).toContain('Centro');
      await api(app, token)
        .patch(`/vehicles/${veiculo.id}`)
        .send({ capacity: 3 })
        .expect(200);
    });

    it('não tira de operação um veículo que está em rota ativa (409)', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const veiculo = await f.veiculo();
      const motorista = await f.motorista();
      await f.rota({
        vehicleId: veiculo.id,
        driverId: motorista.id,
        status: RouteStatus.ACTIVE,
      });

      await api(app, token)
        .patch(`/vehicles/${veiculo.id}`)
        .send({ status: 'MAINTENANCE' })
        .expect(409);
      await api(app, token)
        .patch(`/vehicles/${veiculo.id}`)
        .send({ status: 'INACTIVE' })
        .expect(409);
    });

    it('com a rota em rascunho, o veículo pode ir para manutenção', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const veiculo = await f.veiculo();
      await f.rota({ vehicleId: veiculo.id, status: RouteStatus.DRAFT });

      await api(app, token)
        .patch(`/vehicles/${veiculo.id}`)
        .send({ status: 'MAINTENANCE' })
        .expect(200);
    });

    it('GET /vehicles/:id/routes lista as rotas do veículo', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const veiculo = await f.veiculo();
      await f.rota({ vehicleId: veiculo.id, name: 'Rota A' });
      await f.rota({ vehicleId: veiculo.id, name: 'Rota B' });
      await f.rota({ name: 'Outra do outro veículo' });

      const res = await api(app, token)
        .get(`/vehicles/${veiculo.id}/routes`)
        .expect(200);

      expect(res.body.map((r: { name: string }) => r.name)).toEqual([
        'Rota A',
        'Rota B',
      ]);
      await api(app, token)
        .get(`/vehicles/${UUID_INEXISTENTE}/routes`)
        .expect(404);
    });

    describe('DELETE /vehicles/:id (soft delete: equivale a PATCH { status: INACTIVE })', () => {
      it('desativa o veículo (204)', async () => {
        const { token } = await como(app, Role.OPERATOR);
        const veiculo = await f.veiculo();

        await api(app, token).delete(`/vehicles/${veiculo.id}`).expect(204);

        const buscado = await api(app, token)
          .get(`/vehicles/${veiculo.id}`)
          .expect(200);
        expect(buscado.body.status).toBe('INACTIVE');
      });

      it('inexistente -> 404; id inválido -> 400', async () => {
        const { token } = await como(app, Role.OPERATOR);

        await api(app, token)
          .delete(`/vehicles/${UUID_INEXISTENTE}`)
          .expect(404);
        await api(app, token).delete('/vehicles/xyz').expect(400);
      });

      it('não exclui um veículo que está em rota ativa (409)', async () => {
        const { token } = await como(app, Role.OPERATOR);
        const veiculo = await f.veiculo();
        const motorista = await f.motorista();
        await f.rota({
          vehicleId: veiculo.id,
          driverId: motorista.id,
          status: RouteStatus.ACTIVE,
        });

        await api(app, token).delete(`/vehicles/${veiculo.id}`).expect(409);
      });

      it('com a rota em rascunho, o veículo pode ser excluído', async () => {
        const { token } = await como(app, Role.OPERATOR);
        const veiculo = await f.veiculo();
        await f.rota({ vehicleId: veiculo.id, status: RouteStatus.DRAFT });

        await api(app, token).delete(`/vehicles/${veiculo.id}`).expect(204);
      });
    });
  });

  // ---------------------------------------------------------------------------
  describe('/drivers', () => {
    const corpo = (userId: string) => ({
      userId,
      licenseNumber: 'cnh12345',
      licenseExpiresAt: '2035-12-31',
    });

    it.each([Role.GUARDIAN, Role.DRIVER])(
      '%s não acessa a gestão de motoristas -> 403',
      async (papel) => {
        const { token } = await como(app, papel);
        const motorista = await f.motorista();

        await api(app, token).get('/drivers').expect(403);
        await api(app, token)
          .post('/drivers')
          .send(corpo(UUID_INEXISTENTE))
          .expect(403);
        await api(app, token).get(`/drivers/${motorista.id}`).expect(403);
        await api(app, token)
          .patch(`/drivers/${motorista.id}`)
          .send({ active: false })
          .expect(403);
        await api(app, token)
          .get(`/drivers/${motorista.id}/routes`)
          .expect(403);
      },
    );

    it('cria o perfil de um usuário DRIVER e devolve os dados do usuário sem segredos', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const usuario = await criarUsuario(app, {
        role: Role.DRIVER,
        email: 'joao@teste.com',
      });

      const res = await api(app, token)
        .post('/drivers')
        .send(corpo(usuario.id))
        .expect(201);

      expect(res.body).toMatchObject({
        userId: usuario.id,
        licenseNumber: 'CNH12345', // normalizada em maiúsculas
        active: true,
        user: { id: usuario.id, email: 'joao@teste.com' },
      });
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);
    });

    it('usuário inexistente -> 404; usuário que não é DRIVER -> 409', async () => {
      const { token } = await como(app, Role.ADMIN);
      const responsavel = await criarUsuario(app, {
        role: Role.GUARDIAN,
        email: 'pai@teste.com',
      });

      await api(app, token)
        .post('/drivers')
        .send(corpo(UUID_INEXISTENTE))
        .expect(404);
      const res = await api(app, token)
        .post('/drivers')
        .send(corpo(responsavel.id))
        .expect(409);
      expect(res.body.message).toContain('DRIVER');
    });

    it('um usuário só tem um perfil, e a CNH é única (409)', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const existente = await f.motorista({ licenseNumber: 'CNH12345' });
      const outro = await criarUsuario(app, {
        role: Role.DRIVER,
        email: 'outro@teste.com',
      });

      // mesmo usuário de novo
      await api(app, token)
        .post('/drivers')
        .send({ ...corpo(existente.userId), licenseNumber: 'OUTRA9999' })
        .expect(409);
      // CNH repetida (escrita em minúsculas)
      await api(app, token).post('/drivers').send(corpo(outro.id)).expect(409);
    });

    it.each([
      ['CNH curta', { licenseNumber: 'AB1' }],
      ['CNH com símbolos', { licenseNumber: 'CNH-123$%' }],
      ['data no formato brasileiro', { licenseExpiresAt: '31/12/2035' }],
      ['data inexistente', { licenseExpiresAt: '2035-02-31' }],
      ['mês inexistente', { licenseExpiresAt: '2035-13-01' }],
      ['data com hora', { licenseExpiresAt: '2035-12-31T10:00:00Z' }],
      ['userId que não é UUID', { userId: 'abc' }],
      ['campo extra', { active: false }],
    ])('corpo inválido (%s) -> 400', async (_nome, alteracao) => {
      const { token } = await como(app, Role.OPERATOR);
      const usuario = await criarUsuario(app, {
        role: Role.DRIVER,
        email: 'joao@teste.com',
      });

      await api(app, token)
        .post('/drivers')
        .send({ ...corpo(usuario.id), ...alteracao })
        .expect(400);
    });

    it('lista, busca (200/404/400) e não expõe segredos', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const m1 = await f.motorista();
      await f.motorista();

      const lista = await api(app, token).get('/drivers?limit=1').expect(200);
      const um = await api(app, token).get(`/drivers/${m1.id}`).expect(200);

      expect(lista.body).toMatchObject({ total: 2, limit: 1 });
      expect(um.body.user.email).toBe(m1.user.email);
      expect(JSON.stringify([lista.body, um.body])).not.toMatch(
        /passwordHash|argon2/,
      );
      await api(app, token).get(`/drivers/${UUID_INEXISTENTE}`).expect(404);
      await api(app, token).get('/drivers/xyz').expect(400);
    });

    it('PATCH altera CNH, validade e situação', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const motorista = await f.motorista();

      const res = await api(app, token)
        .patch(`/drivers/${motorista.id}`)
        .send({
          licenseNumber: 'nova12345',
          licenseExpiresAt: '2040-01-15',
          active: false,
        })
        .expect(200);

      expect(res.body).toMatchObject({
        licenseNumber: 'NOVA12345',
        active: false,
      });
      expect(res.body.licenseExpiresAt).toContain('2040-01-15');
    });

    it('PATCH: CNH de outro motorista -> 409; usuário no corpo -> 400; inexistente -> 404', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const a = await f.motorista({ licenseNumber: 'CNH00001' });
      const b = await f.motorista();

      await api(app, token)
        .patch(`/drivers/${b.id}`)
        .send({ licenseNumber: a.licenseNumber })
        .expect(409);
      await api(app, token)
        .patch(`/drivers/${b.id}`)
        .send({ userId: UUID_INEXISTENTE })
        .expect(400);
      await api(app, token)
        .patch(`/drivers/${UUID_INEXISTENTE}`)
        .send({ active: false })
        .expect(404);
    });

    it('não desativa nem deixa vencer a CNH de quem conduz uma rota ativa (409)', async () => {
      const { token } = await como(app, Role.OPERATOR);
      const veiculo = await f.veiculo();
      const motorista = await f.motorista();
      await f.rota({
        vehicleId: veiculo.id,
        driverId: motorista.id,
        status: RouteStatus.ACTIVE,
      });

      await api(app, token)
        .patch(`/drivers/${motorista.id}`)
        .send({ active: false })
        .expect(409);
      await api(app, token)
        .patch(`/drivers/${motorista.id}`)
        .send({ licenseExpiresAt: '2020-01-01' })
        .expect(409);
      // Renovar a CNH é sempre permitido.
      await api(app, token)
        .patch(`/drivers/${motorista.id}`)
        .send({ licenseExpiresAt: daquiAUmAno().toISOString().slice(0, 10) })
        .expect(200);
    });

    describe('conta (usuário) do motorista de uma rota ativa', () => {
      /** Motorista em uma rota ativa, já autenticado (e, se pedido, com viagem em andamento). */
      async function motoristaDeRotaAtiva(comViagem = false) {
        const veiculo = await f.veiculo();
        const motorista = await f.motorista();
        const rota = await f.rota({
          name: 'Rota Norte',
          vehicleId: veiculo.id,
          driverId: motorista.id,
          status: RouteStatus.ACTIVE,
        });
        if (comViagem) {
          await app
            .get(PrismaService)
            .trip.create({ data: { routeId: rota.id } });
        }
        const tokenMotorista = await login(app, motorista.user.email);
        return { motorista, rota, tokenMotorista };
      }

      it('não desativa a conta nem troca o papel de quem conduz a rota (409), e o motorista segue com acesso', async () => {
        const admin = await como(app, Role.ADMIN);
        const { motorista, tokenMotorista } = await motoristaDeRotaAtiva();
        const url = `/users/${motorista.userId}`;

        const desativar = await api(app, admin.token)
          .patch(url)
          .send({ active: false })
          .expect(409);
        expect(desativar.body.message).toContain('Rota Norte');
        await api(app, admin.token)
          .patch(url)
          .send({ role: 'GUARDIAN' })
          .expect(409);
        await api(app, admin.token)
          .patch(url)
          .send({ role: 'OPERATOR' })
          .expect(409);

        await api(app, tokenMotorista).get('/me').expect(200);
        const usuario = await app
          .get(PrismaService)
          .user.findUniqueOrThrow({ where: { id: motorista.userId } });
        expect(usuario).toMatchObject({ active: true, role: 'DRIVER' });
        // Mudanças que não tiram o motorista da rota continuam permitidas.
        await api(app, admin.token)
          .patch(url)
          .send({ name: 'Novo Nome' })
          .expect(200);
        await api(app, admin.token)
          .patch(url)
          .send({ role: 'DRIVER', active: true })
          .expect(200);
      });

      it('com viagem em andamento: a desativação é recusada e a viagem segue de pé', async () => {
        const admin = await como(app, Role.ADMIN);
        const { motorista, rota, tokenMotorista } =
          await motoristaDeRotaAtiva(true);

        await api(app, admin.token)
          .patch(`/users/${motorista.userId}`)
          .send({ active: false })
          .expect(409);

        await api(app, tokenMotorista).get('/me').expect(200);
        const viagem = await app
          .get(PrismaService)
          .trip.findFirstOrThrow({ where: { routeId: rota.id } });
        expect(viagem.status).toBe('IN_PROGRESS');
      });

      it('resolvida a rota (desativada), a conta pode ser desativada e o motorista perde o acesso', async () => {
        const admin = await como(app, Role.ADMIN);
        const { motorista, rota, tokenMotorista } =
          await motoristaDeRotaAtiva();

        await api(app, admin.token)
          .post(`/routes/${rota.id}/deactivate`)
          .expect(200);
        await api(app, admin.token)
          .patch(`/users/${motorista.userId}`)
          .send({ active: false })
          .expect(200);

        await api(app, tokenMotorista).get('/me').expect(401);
      });

      it('rota em rascunho, rota inativa ou nenhuma rota não travam a conta', async () => {
        const admin = await como(app, Role.ADMIN);
        const emRascunho = await f.motorista();
        await f.rota({ driverId: emRascunho.id, status: RouteStatus.DRAFT });
        const emRotaInativa = await f.motorista();
        await f.rota({
          driverId: emRotaInativa.id,
          status: RouteStatus.INACTIVE,
        });
        const semRota = await f.motorista();

        for (const { userId } of [emRascunho, emRotaInativa, semRota]) {
          await api(app, admin.token)
            .patch(`/users/${userId}`)
            .send({ active: false })
            .expect(200);
        }
      });
    });

    it('GET /drivers/:id/routes lista as rotas do motorista', async () => {
      const { token } = await como(app, Role.ADMIN);
      const motorista = await f.motorista();
      await f.rota({ driverId: motorista.id, name: 'Rota do João' });
      await f.rota({ name: 'Rota de outro' });

      const res = await api(app, token)
        .get(`/drivers/${motorista.id}/routes`)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Rota do João');
    });

    describe('DELETE /drivers/:id (soft delete: equivale a PATCH { active: false })', () => {
      it('desativa o perfil de motorista (204)', async () => {
        const { token } = await como(app, Role.OPERATOR);
        const motorista = await f.motorista();

        await api(app, token).delete(`/drivers/${motorista.id}`).expect(204);

        const buscado = await api(app, token)
          .get(`/drivers/${motorista.id}`)
          .expect(200);
        expect(buscado.body.active).toBe(false);
      });

      it('inexistente -> 404; id inválido -> 400', async () => {
        const { token } = await como(app, Role.OPERATOR);

        await api(app, token)
          .delete(`/drivers/${UUID_INEXISTENTE}`)
          .expect(404);
        await api(app, token).delete('/drivers/xyz').expect(400);
      });

      it('não exclui quem conduz uma rota ativa no momento (409)', async () => {
        const { token } = await como(app, Role.OPERATOR);
        const veiculo = await f.veiculo();
        const motorista = await f.motorista();
        await f.rota({
          vehicleId: veiculo.id,
          driverId: motorista.id,
          status: RouteStatus.ACTIVE,
        });

        await api(app, token).delete(`/drivers/${motorista.id}`).expect(409);
      });
    });
  });
});
