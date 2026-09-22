import type { INestApplication } from '@nestjs/common';
import { Role } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { apontarCepPara, iniciarCepMock } from './cep-mock.js';
import { api, como, createApp, limparBanco, login } from './create-app.js';
import { fabricas } from './factories.js';

const UUID_INEXISTENTE = '00000000-0000-7000-8000-000000000000';
const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n',
);

/**
 * Os "10 cenários obrigatórios" da seção "Testes obrigatórios" do AV-09-TRANSPORTE-ESCOLAR.md,
 * um por um, na mesma ordem e numeração do documento. Cada regra já é exercitada de forma
 * exaustiva (dezenas de variações) nos outros arquivos de teste; este arquivo existe só para
 * apontar, num lugar só, exatamente onde cada um dos 10 itens pedidos está demonstrado, com o
 * caso mais simples e direto possível.
 */
describe('10 cenários obrigatórios do AV-09', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let f: ReturnType<typeof fabricas>;
  let cep: Awaited<ReturnType<typeof iniciarCepMock>>;

  beforeAll(async () => {
    app = await createApp();
    prisma = app.get(PrismaService);
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

  it('1. fluxo principal com sucesso: cadastro completo até o embarque e a finalização da viagem', async () => {
    const admin = await como(app, Role.ADMIN);
    const veiculo = await f.veiculo({ capacity: 10 });
    const motorista = await f.motorista();

    const rota = (
      await api(app, admin.token)
        .post('/routes')
        .send({
          name: 'Cenário 1',
          shift: 'MORNING',
          vehicleId: veiculo.id,
          driverId: motorista.id,
        })
        .expect(201)
    ).body;
    const ponto = (
      await api(app, admin.token)
        .post(`/routes/${rota.id}/stops`)
        .send({ cep: '01001000', number: '1' })
        .expect(201)
    ).body;
    await api(app, admin.token).post(`/routes/${rota.id}/activate`).expect(200);
    const aluno = (
      await api(app, admin.token)
        .post('/students')
        .send({
          name: 'Aluno Cenário 1',
          birthDate: '2016-01-01',
          registrationNumber: 'CEN-001',
          schoolName: 'Escola do Cenário 1',
        })
        .expect(201)
    ).body;
    await api(app, admin.token)
      .patch(`/students/${aluno.id}/route`)
      .send({ routeId: rota.id, stopId: ponto.id })
      .expect(200);

    const tokenMotorista = await login(app, motorista.user.email);
    const viagem = (
      await api(app, tokenMotorista)
        .post(`/routes/${rota.id}/trips`)
        .expect(201)
    ).body;
    const embarque = (
      await api(app, tokenMotorista)
        .post(`/trips/${viagem.id}/boardings`)
        .send({ studentId: aluno.id })
        .expect(201)
    ).body;
    await api(app, tokenMotorista)
      .post(`/boardings/${embarque.id}/alight`)
      .expect(200);
    const finalizada = (
      await api(app, tokenMotorista)
        .post(`/trips/${viagem.id}/finish`)
        .expect(200)
    ).body;

    expect(finalizada.status).toBe('FINISHED');
  });

  it('2. body inválido -> 400 (capacidade do veículo fora da faixa permitida)', async () => {
    const { token } = await como(app, Role.OPERATOR);

    const res = await api(app, token)
      .post('/vehicles')
      .send({ plate: 'ABC1D23', model: 'Van', capacity: 0 })
      .expect(400);

    expect(res.body.statusCode).toBe(400);
  });

  it('3. ausência ou invalidez do token -> 401 (sem token e com assinatura adulterada)', async () => {
    const { token } = await como(app, Role.OPERATOR);
    const adulterado = `${token.slice(0, -2)}xx`;

    await api(app).get('/vehicles').expect(401); // sem cabeçalho Authorization
    await api(app, adulterado).get('/vehicles').expect(401); // assinatura inválida
  });

  it('4. usuário autenticado sem permissão -> 403 (responsável tentando gerir veículos)', async () => {
    const { token } = await como(app, Role.GUARDIAN);

    await api(app, token)
      .post('/vehicles')
      .send({ plate: 'ABC1D23', model: 'Van', capacity: 10 })
      .expect(403);
  });

  it('5. recurso inexistente -> 404 (UUID no formato certo, mas nenhum veículo com esse id)', async () => {
    const { token } = await como(app, Role.OPERATOR);

    await api(app, token).get(`/vehicles/${UUID_INEXISTENTE}`).expect(404);
  });

  it('6. conflito de regra de negócio -> 409 (capacidade da rota/veículo, citada pelo próprio AV-09)', async () => {
    const { token } = await como(app, Role.OPERATOR);
    const veiculo = await f.veiculo({ capacity: 1 });
    const rota = await f.rota({ vehicleId: veiculo.id });
    const ponto = await f.ponto(rota.id);
    await f.aluno({ routeId: rota.id, stopId: ponto.id }); // ocupa a única vaga
    const semVaga = await f.aluno();

    const res = await api(app, token)
      .patch(`/students/${semVaga.id}/route`)
      .send({ routeId: rota.id, stopId: ponto.id })
      .expect(409);

    expect(res.body.message).toContain('lotada');
  });

  it('7. tentativa de acesso a recurso de terceiro -> 403 (vínculo de outro responsável)', async () => {
    const aluno = await f.aluno();
    const dono = await como(app, Role.GUARDIAN, 'dono@teste.com');
    const terceiro = await como(app, Role.GUARDIAN, 'terceiro@teste.com');
    const vinculo = await prisma.guardianRelation.create({
      data: {
        guardianId: dono.usuario.id,
        studentId: aluno.id,
        relationship: 'MOTHER',
      },
    });

    // O vínculo EXISTE (não é 404): pertence a outro responsável, então é 403.
    await api(app, terceiro.token)
      .get(`/guardian-relations/${vinculo.id}`)
      .expect(403);
  });

  it('8. upload válido e inválido (documento de autorização do vínculo responsável-aluno)', async () => {
    const aluno = await f.aluno();
    const dono = await como(app, Role.GUARDIAN);
    const operador = await como(app, Role.OPERATOR);
    const vinculo = (
      await api(app, operador.token)
        .post('/guardian-relations')
        .send({
          guardianId: dono.usuario.id,
          studentId: aluno.id,
          relationship: 'MOTHER',
        })
        .expect(201)
    ).body;

    await api(app, dono.token)
      .post(`/guardian-relations/${vinculo.id}/document`)
      .attach('file', Buffer.from('isto não é um PDF de verdade'), 'falso.pdf')
      .expect(400);
    const valido = await api(app, dono.token)
      .post(`/guardian-relations/${vinculo.id}/document`)
      .attach('file', PDF, 'autorizacao.pdf')
      .expect(200);

    expect(valido.body.documentMime).toBe('application/pdf');
  });

  it('9. integração externa funcionando e falhando de forma controlada (consulta de CEP)', async () => {
    const { token } = await como(app, Role.OPERATOR);
    const rota = await f.rota();

    await api(app, token)
      .post(`/routes/${rota.id}/stops`)
      .send({ cep: '01001000', number: '1' })
      .expect(201); // funcionando

    cep.definir({ status: 500 });
    await api(app, token)
      .post(`/routes/${rota.id}/stops`)
      .send({ cep: '01001000', number: '2' })
      .expect(502); // falhando, de forma controlada (nunca 500 nem trava)
  });

  it('10. fluxo completo de mudança de estado (vínculo: PENDING -> documento -> ACTIVE -> REVOKED)', async () => {
    const aluno = await f.aluno();
    const dono = await como(app, Role.GUARDIAN);
    const operador = await como(app, Role.OPERATOR);
    const vinculo = (
      await api(app, operador.token)
        .post('/guardian-relations')
        .send({
          guardianId: dono.usuario.id,
          studentId: aluno.id,
          relationship: 'MOTHER',
        })
        .expect(201)
    ).body;
    expect(vinculo.status).toBe('PENDING');

    await api(app, dono.token)
      .post(`/guardian-relations/${vinculo.id}/document`)
      .attach('file', PDF, 'autorizacao.pdf')
      .expect(200);
    const ativo = await api(app, operador.token)
      .post(`/guardian-relations/${vinculo.id}/approve`)
      .expect(200);
    expect(ativo.body.status).toBe('ACTIVE');
    const revogado = await api(app, operador.token)
      .post(`/guardian-relations/${vinculo.id}/revoke`)
      .expect(200);
    expect(revogado.body.status).toBe('REVOKED');
  });
});
