import { existsSync } from 'node:fs';
import { readdir, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { vi } from 'vitest';
import {
  GuardianRelationStatus,
  Relationship,
  Role,
  type Prisma,
} from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { api, como, createApp, limparBanco } from './create-app.js';
import { fabricas } from './factories.js';

const UUID_INEXISTENTE = '00000000-0000-7000-8000-000000000000';

// Arquivos mínimos, mas com o cabeçalho real de cada formato: o servidor confere o CONTEÚDO.
const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n',
);
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01,
  0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
]);
const GIF = Buffer.from('GIF89a\x01\x00\x01\x00\x80\x00\x00', 'latin1');

/** PDF válido com exatamente `tamanho` bytes (completa com espaços). */
const pdfComTamanho = (tamanho: number) =>
  Buffer.concat([PDF, Buffer.alloc(tamanho - PDF.length, 0x20)]);

describe('Vínculos responsável-aluno e documento de autorização', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let f: ReturnType<typeof fabricas>;
  let pastaUploads: string;
  let limiteUpload: number;

  const arquivosNaPasta = () =>
    readdir(pastaUploads).catch(() => [] as string[]);

  /** Aluno + responsável dono do vínculo (já autenticado). */
  async function montar() {
    const aluno = await f.aluno();
    const dono = await como(app, Role.GUARDIAN, 'mae@teste.com');
    return { aluno, dono };
  }

  /** Vínculo criado direto no banco, na situação pedida. */
  const vinculoNoBanco = (
    guardianId: string,
    studentId: string,
    dados: Partial<Prisma.GuardianRelationUncheckedCreateInput> = {},
  ) =>
    prisma.guardianRelation.create({
      data: {
        guardianId,
        studentId,
        relationship: Relationship.MOTHER,
        ...dados,
      },
    });

  /** Upload como o navegador faz: multipart, campo "file". */
  const enviar = (
    token: string,
    id: string,
    conteudo: Buffer,
    nome = 'autorizacao.pdf',
  ) =>
    api(app, token)
      .post(`/guardian-relations/${id}/document`)
      .attach('file', conteudo, nome);

  /** Baixa o documento como Buffer (o supertest só entende texto e JSON por padrão). */
  const baixar = (token: string, id: string) =>
    api(app, token)
      .get(`/guardian-relations/${id}/document`)
      .buffer(true)
      .parse((res, callback) => {
        const partes: Buffer[] = [];
        res.on('data', (parte: Buffer) => partes.push(parte));
        res.on('end', () => callback(null, Buffer.concat(partes)));
      });

  /** Vínculo pendente com o documento (PDF) já enviado pelo responsável, pela API. */
  async function pendenteComDocumento() {
    const { aluno, dono } = await montar();
    const operador = await como(app, Role.OPERATOR);
    const vinculo = await vinculoNoBanco(dono.usuario.id, aluno.id);
    await enviar(dono.token, vinculo.id, PDF).expect(200);
    return { aluno, dono, operador, vinculo };
  }

  const situacaoNoBanco = async (id: string) =>
    (await prisma.guardianRelation.findUniqueOrThrow({ where: { id } })).status;

  beforeAll(async () => {
    app = await createApp();
    prisma = app.get(PrismaService);
    f = fabricas(app);
    const config = app.get(ConfigService);
    pastaUploads = resolve(config.getOrThrow<string>('UPLOAD_DIR'));
    limiteUpload = config.getOrThrow<number>('UPLOAD_MAX_BYTES');
    // Trava de segurança: os testes só apagam a pasta de uploads DE TESTE.
    expect(pastaUploads).toMatch(/test-uploads$/);
  });
  beforeEach(async () => {
    await limparBanco(app);
    await rm(pastaUploads, { recursive: true, force: true });
  });
  afterAll(async () => {
    await limparBanco(app);
    await rm(pastaUploads, { recursive: true, force: true });
    await app.close();
  });

  // ---------------------------------------------------------------------------
  describe('autenticação e papéis', () => {
    it('sem API key ou sem token, nenhuma rota responde (401)', async () => {
      const rotas = [
        ['post', '/guardian-relations'],
        ['get', '/guardian-relations'],
        ['get', `/guardian-relations/${UUID_INEXISTENTE}`],
        ['post', `/guardian-relations/${UUID_INEXISTENTE}/document`],
        ['get', `/guardian-relations/${UUID_INEXISTENTE}/document`],
        ['post', `/guardian-relations/${UUID_INEXISTENTE}/approve`],
        ['post', `/guardian-relations/${UUID_INEXISTENTE}/reject`],
        ['post', `/guardian-relations/${UUID_INEXISTENTE}/revoke`],
      ] as const;

      for (const [metodo, url] of rotas) {
        await api(app).cru()[metodo](url).expect(401);
        await api(app)[metodo](url).expect(401);
      }
    });

    it.each([Role.GUARDIAN, Role.DRIVER])(
      '%s não cria, aprova, rejeita nem revoga vínculos (403)',
      async (papel) => {
        const { aluno, dono } = await montar();
        const vinculo = await vinculoNoBanco(dono.usuario.id, aluno.id);
        const { token } = await como(app, papel, 'ator@teste.com');
        const base = `/guardian-relations/${vinculo.id}`;

        await api(app, token)
          .post('/guardian-relations')
          .send({
            guardianId: dono.usuario.id,
            studentId: aluno.id,
            relationship: 'FATHER',
          })
          .expect(403);
        await api(app, token).post(`${base}/approve`).expect(403);
        await api(app, token)
          .post(`${base}/reject`)
          .send({ reason: 'motivo qualquer' })
          .expect(403);
        await api(app, token).post(`${base}/revoke`).expect(403);
        expect(await situacaoNoBanco(vinculo.id)).toBe(
          GuardianRelationStatus.PENDING,
        );
      },
    );

    it('DRIVER não lista vínculos nem vê documentos (403)', async () => {
      const { aluno, dono } = await montar();
      const vinculo = await vinculoNoBanco(dono.usuario.id, aluno.id);
      const { token } = await como(app, Role.DRIVER);

      await api(app, token).get('/guardian-relations').expect(403);
      await api(app, token)
        .get(`/guardian-relations/${vinculo.id}`)
        .expect(403);
      await api(app, token)
        .get(`/guardian-relations/${vinculo.id}/document`)
        .expect(403);
    });
  });

  // ---------------------------------------------------------------------------
  describe('POST /guardian-relations', () => {
    it.each([Role.OPERATOR, Role.ADMIN])(
      '%s cria o vínculo: nasce PENDING, sem documento e sem dados internos (201)',
      async (papel) => {
        const { aluno, dono } = await montar();
        const { token } = await como(app, papel);

        const res = await api(app, token)
          .post('/guardian-relations')
          .send({
            guardianId: dono.usuario.id,
            studentId: aluno.id,
            relationship: 'MOTHER',
          })
          .expect(201);

        expect(res.body).toMatchObject({
          status: 'PENDING',
          relationship: 'MOTHER',
          documentName: null,
          documentMime: null,
          documentSize: null,
          reviewedAt: null,
          reviewedBy: null,
          rejectionReason: null,
          guardian: { id: dono.usuario.id, email: 'mae@teste.com' },
          student: { id: aluno.id },
        });
        const texto = JSON.stringify(res.body);
        expect(texto).not.toContain('documentPath');
        expect(texto).not.toContain('passwordHash');
        expect(await prisma.guardianRelation.count()).toBe(1);
      },
    );

    const invalidos: [string, (g: string, s: string) => object][] = [
      ['corpo vazio', () => ({})],
      [
        'guardianId que não é UUID',
        (_g, s) => ({
          guardianId: 'abc',
          studentId: s,
          relationship: 'MOTHER',
        }),
      ],
      ['studentId ausente', (g) => ({ guardianId: g, relationship: 'MOTHER' })],
      [
        'parentesco inexistente',
        (g, s) => ({ guardianId: g, studentId: s, relationship: 'GATO' }),
      ],
      [
        'parentesco em minúsculas',
        (g, s) => ({ guardianId: g, studentId: s, relationship: 'mother' }),
      ],
      [
        'campo extra "status" (tentar criar já ativo)',
        (g, s) => ({
          guardianId: g,
          studentId: s,
          relationship: 'MOTHER',
          status: 'ACTIVE',
        }),
      ],
      [
        'campo extra "documentPath"',
        (g, s) => ({
          guardianId: g,
          studentId: s,
          relationship: 'MOTHER',
          documentPath: '../../etc/passwd',
        }),
      ],
    ];
    it.each(invalidos)('%s -> 400, sem criar nada', async (_nome, corpo) => {
      const { aluno, dono } = await montar();
      const { token } = await como(app, Role.OPERATOR);

      await api(app, token)
        .post('/guardian-relations')
        .send(corpo(dono.usuario.id, aluno.id))
        .expect(400);
      expect(await prisma.guardianRelation.count()).toBe(0);
    });

    it('responsável ou aluno inexistente -> 404', async () => {
      const { aluno, dono } = await montar();
      const { token } = await como(app, Role.OPERATOR);

      await api(app, token)
        .post('/guardian-relations')
        .send({
          guardianId: UUID_INEXISTENTE,
          studentId: aluno.id,
          relationship: 'MOTHER',
        })
        .expect(404);
      await api(app, token)
        .post('/guardian-relations')
        .send({
          guardianId: dono.usuario.id,
          studentId: UUID_INEXISTENTE,
          relationship: 'MOTHER',
        })
        .expect(404);
    });

    it('usuário que não é GUARDIAN ou está inativo -> 409', async () => {
      const aluno = await f.aluno();
      const { token } = await como(app, Role.OPERATOR);
      const motorista = await como(app, Role.DRIVER);
      const inativo = await como(app, Role.GUARDIAN, 'inativo@teste.com');
      await prisma.user.update({
        where: { id: inativo.usuario.id },
        data: { active: false },
      });

      for (const guardianId of [motorista.usuario.id, inativo.usuario.id]) {
        await api(app, token)
          .post('/guardian-relations')
          .send({ guardianId, studentId: aluno.id, relationship: 'MOTHER' })
          .expect(409);
      }
      expect(await prisma.guardianRelation.count()).toBe(0);
    });

    it('o mesmo par responsável-aluno só pode ter um vínculo -> 409', async () => {
      const { aluno, dono } = await montar();
      const { token } = await como(app, Role.OPERATOR);
      const corpo = {
        guardianId: dono.usuario.id,
        studentId: aluno.id,
        relationship: 'MOTHER',
      };

      await api(app, token).post('/guardian-relations').send(corpo).expect(201);
      await api(app, token)
        .post('/guardian-relations')
        .send({ ...corpo, relationship: 'LEGAL_GUARDIAN' })
        .expect(409);
      expect(await prisma.guardianRelation.count()).toBe(1);
    });

    it('dois cadastros simultâneos do mesmo par: um vence (201), o outro recebe 409', async () => {
      const { aluno, dono } = await montar();
      const { token } = await como(app, Role.OPERATOR);
      const corpo = {
        guardianId: dono.usuario.id,
        studentId: aluno.id,
        relationship: 'MOTHER',
      };

      const respostas = await Promise.all(
        Array.from({ length: 4 }, () =>
          api(app, token).post('/guardian-relations').send(corpo),
        ),
      );

      const codigos = respostas.map((r) => r.status);
      expect(codigos.filter((c) => c === 201)).toHaveLength(1);
      expect(codigos.filter((c) => c === 409)).toHaveLength(3);
      expect(await prisma.guardianRelation.count()).toBe(1);
    });

    it('depois de REVOGADO, o mesmo par pode ganhar um vínculo novo, e o antigo vira histórico', async () => {
      const { aluno, dono } = await montar();
      const { token } = await como(app, Role.OPERATOR);
      const revogado = await vinculoNoBanco(dono.usuario.id, aluno.id, {
        status: GuardianRelationStatus.REVOKED,
        reviewedAt: new Date('2026-01-10T12:00:00Z'),
        rejectionReason: null,
      });

      const res = await api(app, token)
        .post('/guardian-relations')
        .send({
          guardianId: dono.usuario.id,
          studentId: aluno.id,
          relationship: 'LEGAL_GUARDIAN',
        })
        .expect(201);

      expect(res.body.id).not.toBe(revogado.id);
      expect(res.body.status).toBe('PENDING');
      // As duas linhas convivem: a revogada preserva a data em que perdeu o acesso.
      const linhas = await prisma.guardianRelation.findMany({
        where: { guardianId: dono.usuario.id, studentId: aluno.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(linhas).toHaveLength(2);
      expect(linhas[0]).toMatchObject({
        id: revogado.id,
        status: 'REVOKED',
        reviewedAt: new Date('2026-01-10T12:00:00Z'),
      });
      expect(linhas[1]).toMatchObject({ id: res.body.id, status: 'PENDING' });
    });

    it('duas criações simultâneas para um par já revogado: uma vence (201), a outra recebe 409', async () => {
      const { aluno, dono } = await montar();
      const { token } = await como(app, Role.OPERATOR);
      await vinculoNoBanco(dono.usuario.id, aluno.id, {
        status: GuardianRelationStatus.REVOKED,
      });
      const corpo = {
        guardianId: dono.usuario.id,
        studentId: aluno.id,
        relationship: 'MOTHER',
      };

      const respostas = await Promise.all(
        Array.from({ length: 4 }, () =>
          api(app, token).post('/guardian-relations').send(corpo),
        ),
      );

      const codigos = respostas.map((r) => r.status);
      expect(codigos.filter((c) => c === 201)).toHaveLength(1);
      expect(codigos.filter((c) => c === 409)).toHaveLength(3);
      // A revogada + exatamente 1 nova (nunca 2 não-revogadas para o mesmo par).
      expect(await prisma.guardianRelation.count()).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  describe('GET /guardian-relations e /guardian-relations/:id', () => {
    /** mae: A (pendente) e B (ativo); tio: A (rejeitado). */
    async function cenarioDeListagem() {
      const mae = await como(app, Role.GUARDIAN, 'mae@teste.com');
      const tio = await como(app, Role.GUARDIAN, 'tio@teste.com');
      const alunoA = await f.aluno();
      const alunoB = await f.aluno();
      const v1 = await vinculoNoBanco(mae.usuario.id, alunoA.id);
      const v2 = await vinculoNoBanco(mae.usuario.id, alunoB.id, {
        status: GuardianRelationStatus.ACTIVE,
      });
      const v3 = await vinculoNoBanco(tio.usuario.id, alunoA.id, {
        status: GuardianRelationStatus.REJECTED,
      });
      return { mae, tio, alunoA, alunoB, v1, v2, v3 };
    }
    const ids = (corpo: { data: { id: string }[] }) =>
      corpo.data.map((v) => v.id).sort((a, b) => a.localeCompare(b));
    const ordenados = (...lista: string[]) =>
      [...lista].sort((a, b) => a.localeCompare(b));

    it('o responsável lista só os PRÓPRIOS vínculos; secretaria e admin veem todos', async () => {
      const { mae, tio, v1, v2, v3 } = await cenarioDeListagem();
      const operador = await como(app, Role.OPERATOR);
      const admin = await como(app, Role.ADMIN);

      const daMae = await api(app, mae.token)
        .get('/guardian-relations')
        .expect(200);
      expect(ids(daMae.body)).toEqual(ordenados(v1.id, v2.id));
      expect(daMae.body.total).toBe(2);

      const doTio = await api(app, tio.token)
        .get('/guardian-relations')
        .expect(200);
      expect(ids(doTio.body)).toEqual([v3.id]);

      for (const { token } of [operador, admin]) {
        const todos = await api(app, token)
          .get('/guardian-relations')
          .expect(200);
        expect(ids(todos.body)).toEqual(ordenados(v1.id, v2.id, v3.id));
        expect(todos.body.total).toBe(3);
      }
    });

    it('filtros por situação e por aluno (o responsável nunca enxerga vínculos alheios)', async () => {
      const { mae, alunoA, v1, v2, v3 } = await cenarioDeListagem();
      const { token } = await como(app, Role.OPERATOR);

      const ativos = await api(app, token)
        .get('/guardian-relations?status=ACTIVE')
        .expect(200);
      expect(ids(ativos.body)).toEqual([v2.id]);

      const doAlunoA = await api(app, token)
        .get(`/guardian-relations?studentId=${alunoA.id}`)
        .expect(200);
      expect(ids(doAlunoA.body)).toEqual(ordenados(v1.id, v3.id));

      const combinado = await api(app, token)
        .get(`/guardian-relations?studentId=${alunoA.id}&status=REJECTED`)
        .expect(200);
      expect(ids(combinado.body)).toEqual([v3.id]);

      // A mãe filtra pelo aluno A: só o vínculo dela aparece, o do tio fica oculto.
      const daMae = await api(app, mae.token)
        .get(`/guardian-relations?studentId=${alunoA.id}`)
        .expect(200);
      expect(ids(daMae.body)).toEqual([v1.id]);

      const rejeitadosDaMae = await api(app, mae.token)
        .get('/guardian-relations?status=REJECTED')
        .expect(200);
      expect(rejeitadosDaMae.body).toMatchObject({ data: [], total: 0 });
    });

    it('paginação: páginas sem repetir nem pular vínculos', async () => {
      const { v1, v2, v3 } = await cenarioDeListagem();
      const { token } = await como(app, Role.OPERATOR);

      const p1 = await api(app, token)
        .get('/guardian-relations?limit=2&page=1')
        .expect(200);
      const p2 = await api(app, token)
        .get('/guardian-relations?limit=2&page=2')
        .expect(200);

      expect(p1.body).toMatchObject({ total: 3, page: 1, limit: 2 });
      expect(p1.body.data).toHaveLength(2);
      expect(p2.body.data).toHaveLength(1);
      expect(ordenados(...ids(p1.body), ...ids(p2.body))).toEqual(
        ordenados(v1.id, v2.id, v3.id),
      );
    });

    it('lista vazia devolve a estrutura de paginação, não erro', async () => {
      const { token } = await como(app, Role.OPERATOR);

      const res = await api(app, token).get('/guardian-relations').expect(200);

      expect(res.body).toEqual({ data: [], total: 0, page: 1, limit: 20 });
    });

    it.each([
      'limit=0',
      'limit=101',
      'page=0',
      'status=XYZ',
      'status=active',
      'studentId=abc',
      'desconhecido=1',
    ])('consulta inválida (%s) -> 400', async (consulta) => {
      const { token } = await como(app, Role.OPERATOR);

      await api(app, token).get(`/guardian-relations?${consulta}`).expect(400);
    });

    it('GET /:id: o dono e a secretaria veem; responsável de terceiros -> 403', async () => {
      const { mae, v1 } = await cenarioDeListagem();
      const terceiro = await como(app, Role.GUARDIAN, 'terceiro@teste.com');
      const operador = await como(app, Role.OPERATOR);
      const admin = await como(app, Role.ADMIN);

      for (const { token } of [mae, operador, admin]) {
        const res = await api(app, token)
          .get(`/guardian-relations/${v1.id}`)
          .expect(200);
        expect(res.body).toMatchObject({ id: v1.id, status: 'PENDING' });
        expect(JSON.stringify(res.body)).not.toContain('documentPath');
      }
      await api(app, terceiro.token)
        .get(`/guardian-relations/${v1.id}`)
        .expect(403);
    });

    it('GET /:id: id inexistente -> 404; id malformado -> 400', async () => {
      const { token } = await como(app, Role.OPERATOR);

      await api(app, token)
        .get(`/guardian-relations/${UUID_INEXISTENTE}`)
        .expect(404);
      await api(app, token).get('/guardian-relations/nao-e-uuid').expect(400);
    });
  });

  // ---------------------------------------------------------------------------
  describe('POST /guardian-relations/:id/document (upload)', () => {
    it.each([
      ['PDF', PDF, 'application/pdf', 'pdf', 'contrato.pdf'],
      ['PNG', PNG, 'image/png', 'png', 'foto.png'],
      ['JPEG', JPEG, 'image/jpeg', 'jpg', 'foto.jpeg'],
    ])(
      'aceita %s: grava em disco com nome gerado e guarda os metadados no banco (200)',
      async (_nome, conteudo, mime, extensao, nomeEnviado) => {
        const { aluno, dono } = await montar();
        const vinculo = await vinculoNoBanco(dono.usuario.id, aluno.id);

        const res = await enviar(
          dono.token,
          vinculo.id,
          conteudo,
          nomeEnviado,
        ).expect(200);

        expect(res.body).toMatchObject({
          id: vinculo.id,
          status: 'PENDING',
          documentName: nomeEnviado,
          documentMime: mime,
          documentSize: conteudo.length,
        });
        expect(JSON.stringify(res.body)).not.toContain('documentPath');

        const registro = await prisma.guardianRelation.findUniqueOrThrow({
          where: { id: vinculo.id },
        });
        expect(registro.documentPath).toMatch(
          new RegExp(`^[0-9a-f-]{36}\\.${extensao}$`),
        );
        expect(await arquivosNaPasta()).toEqual([registro.documentPath]);
        const gravado = await readFile(
          join(pastaUploads, registro.documentPath!),
        );
        expect(gravado.equals(conteudo)).toBe(true);
      },
    );

    it('o tipo vem do CONTEÚDO: um PNG enviado como "foto.pdf" com Content-Type PDF é gravado como PNG', async () => {
      const { aluno, dono } = await montar();
      const vinculo = await vinculoNoBanco(dono.usuario.id, aluno.id);

      const res = await api(app, dono.token)
        .post(`/guardian-relations/${vinculo.id}/document`)
        .attach('file', PNG, {
          filename: 'foto.pdf',
          contentType: 'application/pdf',
        })
        .expect(200);

      expect(res.body.documentMime).toBe('image/png');
      const registro = await prisma.guardianRelation.findUniqueOrThrow({
        where: { id: vinculo.id },
      });
      expect(registro.documentPath).toMatch(/\.png$/);
    });

    it('o nome enviado pelo cliente nunca vira caminho no servidor', async () => {
      const { aluno, dono } = await montar();
      const vinculo = await vinculoNoBanco(dono.usuario.id, aluno.id);

      // "filepath" faz o cliente enviar o caminho inteiro no nome do arquivo (como um cliente
      // malicioso faria). A opção existe no form-data, mas não nos tipos: por isso a variável.
      const comCaminho = {
        filepath: '../../evil.pdf',
        contentType: 'application/pdf',
      };
      const res = await api(app, dono.token)
        .post(`/guardian-relations/${vinculo.id}/document`)
        .attach('file', PDF, comCaminho)
        .expect(200);

      expect(res.body.documentName).toBe('evil.pdf');
      const [arquivo] = await arquivosNaPasta();
      expect(arquivo).toMatch(/^[0-9a-f-]{36}\.pdf$/);
      for (const fora of [
        join(pastaUploads, 'evil.pdf'),
        join(pastaUploads, '..', 'evil.pdf'),
        join(pastaUploads, '..', '..', 'evil.pdf'),
      ]) {
        expect(existsSync(fora)).toBe(false);
      }
    });

    it('o nome exibido é higienizado: sem acentos deformados, símbolos nem tamanho exagerado', async () => {
      const { aluno, dono } = await montar();
      const vinculo = await vinculoNoBanco(dono.usuario.id, aluno.id);

      const acentuado = await enviar(
        dono.token,
        vinculo.id,
        PDF,
        'Autorização do Pai.pdf',
      ).expect(200);
      expect(acentuado.body.documentName).toBe('Autorizacao do Pai.pdf');

      const estranho = await enviar(
        dono.token,
        vinculo.id,
        PDF,
        'relatório (final) #1 & mais <b>.pdf',
      ).expect(200);
      expect(estranho.body.documentName).toMatch(/^[\w. -]+$/);

      const longo = await enviar(
        dono.token,
        vinculo.id,
        PDF,
        `${'a'.repeat(300)}.pdf`,
      ).expect(200);
      expect(longo.body.documentName.length).toBeLessThanOrEqual(100);
      expect(longo.body.documentName).toMatch(/\.pdf$/);
    });

    it('aceita um arquivo com exatamente o tamanho máximo (UPLOAD_MAX_BYTES)', async () => {
      const { aluno, dono } = await montar();
      const vinculo = await vinculoNoBanco(dono.usuario.id, aluno.id);

      const res = await enviar(
        dono.token,
        vinculo.id,
        pdfComTamanho(limiteUpload),
      ).expect(200);

      expect(res.body.documentSize).toBe(limiteUpload);
    });

    it('acima do tamanho máximo -> 413, sem gravar nada', async () => {
      const { aluno, dono } = await montar();
      const vinculo = await vinculoNoBanco(dono.usuario.id, aluno.id);

      await enviar(
        dono.token,
        vinculo.id,
        pdfComTamanho(limiteUpload + 1),
      ).expect(413);

      expect(await arquivosNaPasta()).toEqual([]);
      const registro = await prisma.guardianRelation.findUniqueOrThrow({
        where: { id: vinculo.id },
      });
      expect(registro.documentPath).toBeNull();
    });

    const rejeitados: [string, Buffer, string][] = [
      ['texto puro', Buffer.from('apenas um texto'), 'notas.txt'],
      [
        'texto disfarçado de PDF (só o nome diz PDF)',
        Buffer.from('não sou um pdf'),
        'contrato.pdf',
      ],
      [
        'HTML com script disfarçado de PNG',
        Buffer.from('<html><script>alert(1)</script></html>'),
        'foto.png',
      ],
      [
        'executável (MZ) disfarçado de PDF',
        Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200)]),
        'contrato.pdf',
      ],
      [
        'ZIP disfarçado de PDF',
        Buffer.from([
          0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00, 0, 0, 0,
          0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        ]),
        'contrato.pdf',
      ],
      ['GIF (formato não permitido)', GIF, 'imagem.gif'],
      ['arquivo vazio', Buffer.alloc(0), 'vazio.pdf'],
    ];
    it.each(rejeitados)(
      'rejeita %s -> 400, sem gravar nada',
      async (_nome, conteudo, nome) => {
        const { aluno, dono } = await montar();
        const vinculo = await vinculoNoBanco(dono.usuario.id, aluno.id);

        // O Content-Type declarado é sempre "application/pdf": o servidor não deve confiar nele.
        const res = await api(app, dono.token)
          .post(`/guardian-relations/${vinculo.id}/document`)
          .attach('file', conteudo, {
            filename: nome,
            contentType: 'application/pdf',
          })
          .expect(400);

        expect(res.body.message).toMatch(/PDF, JPEG ou PNG|vazio/);
        expect(await arquivosNaPasta()).toEqual([]);
        const registro = await prisma.guardianRelation.findUniqueOrThrow({
          where: { id: vinculo.id },
        });
        expect(registro).toMatchObject({
          documentPath: null,
          status: 'PENDING',
        });
      },
    );

    it('requisições sem o arquivo esperado -> 400', async () => {
      const { aluno, dono } = await montar();
      const vinculo = await vinculoNoBanco(dono.usuario.id, aluno.id);
      const url = `/guardian-relations/${vinculo.id}/document`;

      // multipart sem nenhum arquivo
      await api(app, dono.token)
        .post(url)
        .field('observacao', 'sem arquivo')
        .expect(400);
      // arquivo no campo errado
      await api(app, dono.token)
        .post(url)
        .attach('arquivo', PDF, 'a.pdf')
        .expect(400);
      // corpo JSON em vez de multipart
      await api(app, dono.token).post(url).send({}).expect(400);
      // dois arquivos de uma vez
      await api(app, dono.token)
        .post(url)
        .attach('file', PDF, 'a.pdf')
        .attach('file', PDF, 'b.pdf')
        .expect(400);

      expect(await arquivosNaPasta()).toEqual([]);
    });

    it('só o responsável dono envia: secretaria, admin, motorista e responsável de terceiros -> 403', async () => {
      const { aluno, dono } = await montar();
      const vinculo = await vinculoNoBanco(dono.usuario.id, aluno.id);
      const atores = [
        await como(app, Role.OPERATOR),
        await como(app, Role.ADMIN),
        await como(app, Role.DRIVER),
        await como(app, Role.GUARDIAN, 'terceiro@teste.com'),
      ];

      for (const { token } of atores) {
        await enviar(token, vinculo.id, PDF).expect(403);
      }
      expect(await arquivosNaPasta()).toEqual([]);
    });

    it('vínculo inexistente -> 404; id malformado -> 400', async () => {
      const { dono } = await montar();

      await enviar(dono.token, UUID_INEXISTENTE, PDF).expect(404);
      await enviar(dono.token, 'nao-e-uuid', PDF).expect(400);
      expect(await arquivosNaPasta()).toEqual([]);
    });

    it.each([GuardianRelationStatus.ACTIVE, GuardianRelationStatus.REVOKED])(
      'com o vínculo %s não aceita novo documento -> 409',
      async (status) => {
        const { aluno, dono } = await montar();
        const vinculo = await vinculoNoBanco(dono.usuario.id, aluno.id, {
          status,
        });

        await enviar(dono.token, vinculo.id, PDF).expect(409);

        expect(await arquivosNaPasta()).toEqual([]);
        expect(await situacaoNoBanco(vinculo.id)).toBe(status);
      },
    );

    it('reenviar com o vínculo PENDENTE substitui o documento e apaga o arquivo antigo', async () => {
      const { dono, vinculo } = await pendenteComDocumento();
      const antigo = await prisma.guardianRelation.findUniqueOrThrow({
        where: { id: vinculo.id },
      });

      const res = await enviar(dono.token, vinculo.id, PNG, 'nova.png').expect(
        200,
      );

      expect(res.body).toMatchObject({
        status: 'PENDING',
        documentMime: 'image/png',
      });
      const atual = await prisma.guardianRelation.findUniqueOrThrow({
        where: { id: vinculo.id },
      });
      expect(atual.documentPath).not.toBe(antigo.documentPath);
      expect(await arquivosNaPasta()).toEqual([atual.documentPath]);
      const baixado = await baixar(dono.token, vinculo.id).expect(200);
      expect((baixado.body as Buffer).equals(PNG)).toBe(true);
    });

    it('depois de REJEITADO, reenviar volta o vínculo para PENDENTE e limpa a análise anterior', async () => {
      const { dono, operador, vinculo } = await pendenteComDocumento();
      await api(app, operador.token)
        .post(`/guardian-relations/${vinculo.id}/reject`)
        .send({ reason: 'documento ilegível' })
        .expect(200);

      const res = await enviar(dono.token, vinculo.id, JPEG, 'novo.jpg').expect(
        200,
      );

      expect(res.body).toMatchObject({
        status: 'PENDING',
        rejectionReason: null,
        reviewedAt: null,
        reviewedBy: null,
        documentMime: 'image/jpeg',
      });
      expect(await arquivosNaPasta()).toHaveLength(1);
    });

    it('se o banco falhar ao gravar, o arquivo recém-gravado é apagado (sem órfão no disco)', async () => {
      const { aluno, dono } = await montar();
      const vinculo = await vinculoNoBanco(dono.usuario.id, aluno.id);
      const espiao = vi
        .spyOn(prisma.guardianRelation, 'updateMany')
        .mockRejectedValueOnce(new Error('falha simulada do banco'));

      const res = await enviar(dono.token, vinculo.id, PDF);
      espiao.mockRestore();

      expect(res.status).toBe(500);
      expect(await arquivosNaPasta()).toEqual([]);
      const registro = await prisma.guardianRelation.findUniqueOrThrow({
        where: { id: vinculo.id },
      });
      expect(registro.documentPath).toBeNull();
    });

    it('dois envios simultâneos: nenhum arquivo fica órfão e o banco aponta para o que sobrou', async () => {
      const { dono, vinculo } = await pendenteComDocumento();

      const respostas = await Promise.all([
        enviar(dono.token, vinculo.id, PNG, 'a.png'),
        enviar(dono.token, vinculo.id, JPEG, 'b.jpg'),
        enviar(dono.token, vinculo.id, PDF, 'c.pdf'),
      ]);

      const codigos = respostas.map((r) => r.status);
      expect(codigos.every((c) => c === 200 || c === 409)).toBe(true);
      expect(codigos).toContain(200);
      const registro = await prisma.guardianRelation.findUniqueOrThrow({
        where: { id: vinculo.id },
      });
      expect(await arquivosNaPasta()).toEqual([registro.documentPath]);
    });
  });

  // ---------------------------------------------------------------------------
  describe('GET /guardian-relations/:id/document (download)', () => {
    it('o dono e a secretaria baixam o mesmo arquivo enviado, como anexo e sem cache', async () => {
      const { dono, operador, vinculo } = await pendenteComDocumento();
      const admin = await como(app, Role.ADMIN);

      for (const { token } of [dono, operador, admin]) {
        const res = await baixar(token, vinculo.id).expect(200);

        expect((res.body as Buffer).equals(PDF)).toBe(true);
        expect(res.headers['content-type']).toContain('application/pdf');
        expect(res.headers['content-disposition']).toBe(
          'attachment; filename="autorizacao.pdf"',
        );
        expect(res.headers['cache-control']).toBe('no-store');
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.headers['content-length']).toBe(String(PDF.length));
      }
    });

    it('responsável de terceiros e motorista -> 403', async () => {
      const { vinculo } = await pendenteComDocumento();
      const terceiro = await como(app, Role.GUARDIAN, 'terceiro@teste.com');
      const motorista = await como(app, Role.DRIVER);

      for (const { token } of [terceiro, motorista]) {
        await api(app, token)
          .get(`/guardian-relations/${vinculo.id}/document`)
          .expect(403);
      }
    });

    it('vínculo sem documento ou inexistente -> 404; id malformado -> 400', async () => {
      const { aluno, dono } = await montar();
      const semDocumento = await vinculoNoBanco(dono.usuario.id, aluno.id);

      await api(app, dono.token)
        .get(`/guardian-relations/${semDocumento.id}/document`)
        .expect(404);
      await api(app, dono.token)
        .get(`/guardian-relations/${UUID_INEXISTENTE}/document`)
        .expect(404);
      await api(app, dono.token)
        .get('/guardian-relations/nao-e-uuid/document')
        .expect(400);
    });

    it('arquivo apagado do disco (banco ainda aponta para ele) -> 404', async () => {
      const { dono, vinculo } = await pendenteComDocumento();
      await rm(pastaUploads, { recursive: true, force: true });

      await api(app, dono.token)
        .get(`/guardian-relations/${vinculo.id}/document`)
        .expect(404);
    });

    it('caminho adulterado no banco nunca sai da pasta de uploads (defesa extra)', async () => {
      const { dono, vinculo } = await pendenteComDocumento();
      await prisma.guardianRelation.update({
        where: { id: vinculo.id },
        data: { documentPath: '../../package.json' },
      });

      const res = await api(app, dono.token).get(
        `/guardian-relations/${vinculo.id}/document`,
      );

      expect(res.status).toBe(404);
      expect(JSON.stringify(res.body)).not.toContain('"scripts"');
    });
  });

  // ---------------------------------------------------------------------------
  describe('aprovar, rejeitar e revogar', () => {
    const acao = (
      token: string,
      id: string,
      nome: 'approve' | 'reject' | 'revoke',
    ) => {
      const req = api(app, token).post(`/guardian-relations/${id}/${nome}`);
      return nome === 'reject'
        ? req.send({ reason: 'documento ilegível' })
        : req;
    };

    it('aprovar: exige o documento (409) e depois ativa, registrando quem analisou e quando', async () => {
      const { aluno, dono } = await montar();
      const operador = await como(app, Role.OPERATOR);
      const vinculo = await vinculoNoBanco(dono.usuario.id, aluno.id);

      const semDocumento = await acao(
        operador.token,
        vinculo.id,
        'approve',
      ).expect(409);
      expect(semDocumento.body.message).toMatch(/documento/);
      expect(await situacaoNoBanco(vinculo.id)).toBe('PENDING');

      await enviar(dono.token, vinculo.id, PDF).expect(200);
      const res = await acao(operador.token, vinculo.id, 'approve').expect(200);

      expect(res.body).toMatchObject({
        status: 'ACTIVE',
        rejectionReason: null,
        reviewedBy: { id: operador.usuario.id, name: operador.usuario.name },
      });
      expect(Date.now() - new Date(res.body.reviewedAt).getTime()).toBeLessThan(
        60_000,
      );
      expect(JSON.stringify(res.body.reviewedBy)).not.toContain('email');
    });

    it('rejeitar: exige um motivo válido (400) e registra o motivo', async () => {
      const { operador, vinculo } = await pendenteComDocumento();
      const url = `/guardian-relations/${vinculo.id}/reject`;

      await api(app, operador.token).post(url).expect(400);
      await api(app, operador.token).post(url).send({}).expect(400);
      await api(app, operador.token)
        .post(url)
        .send({ reason: 'ab' })
        .expect(400);
      await api(app, operador.token)
        .post(url)
        .send({ reason: '     ' })
        .expect(400);
      await api(app, operador.token)
        .post(url)
        .send({ reason: 'x'.repeat(301) })
        .expect(400);
      await api(app, operador.token)
        .post(url)
        .send({ reason: 123 })
        .expect(400);
      await api(app, operador.token)
        .post(url)
        .send({ reason: 'motivo válido', status: 'ACTIVE' })
        .expect(400);
      expect(await situacaoNoBanco(vinculo.id)).toBe('PENDING');

      const res = await api(app, operador.token)
        .post(url)
        .send({ reason: '  Documento ilegível  ' })
        .expect(200);

      expect(res.body).toMatchObject({
        status: 'REJECTED',
        rejectionReason: 'Documento ilegível',
        reviewedBy: { id: operador.usuario.id },
      });
    });

    it('revogar: só vínculo ATIVO vira REVOGADO', async () => {
      const { operador, vinculo } = await pendenteComDocumento();

      await acao(operador.token, vinculo.id, 'revoke').expect(409);
      await acao(operador.token, vinculo.id, 'approve').expect(200);
      const res = await acao(operador.token, vinculo.id, 'revoke').expect(200);

      expect(res.body.status).toBe('REVOKED');
    });

    it('transições inválidas -> 409 e a situação não muda', async () => {
      const { operador, vinculo } = await pendenteComDocumento();
      const id = vinculo.id;

      // PENDENTE -> ativa; ativar de novo, rejeitar ou enviar documento não vale mais.
      await acao(operador.token, id, 'approve').expect(200);
      await acao(operador.token, id, 'approve').expect(409);
      await acao(operador.token, id, 'reject').expect(409);
      expect(await situacaoNoBanco(id)).toBe('ACTIVE');

      // ATIVO -> revogado; REVOGADO é definitivo (não aprova, não rejeita, não revoga de novo).
      await acao(operador.token, id, 'revoke').expect(200);
      await acao(operador.token, id, 'revoke').expect(409);
      await acao(operador.token, id, 'approve').expect(409);
      await acao(operador.token, id, 'reject').expect(409);
      expect(await situacaoNoBanco(id)).toBe('REVOKED');
    });

    it('vínculo REJEITADO não pode ser aprovado nem revogado antes de um novo documento', async () => {
      const { operador, vinculo } = await pendenteComDocumento();
      await acao(operador.token, vinculo.id, 'reject').expect(200);

      await acao(operador.token, vinculo.id, 'approve').expect(409);
      await acao(operador.token, vinculo.id, 'reject').expect(409);
      await acao(operador.token, vinculo.id, 'revoke').expect(409);
      expect(await situacaoNoBanco(vinculo.id)).toBe('REJECTED');
    });

    it('vínculo inexistente -> 404; id malformado -> 400', async () => {
      const { token } = await como(app, Role.OPERATOR);

      for (const nome of ['approve', 'reject', 'revoke'] as const) {
        await acao(token, UUID_INEXISTENTE, nome).expect(404);
        await acao(token, 'nao-e-uuid', nome).expect(400);
      }
    });

    it('aprovar e rejeitar ao mesmo tempo: uma ação vence (200) e a outra recebe 409', async () => {
      const { operador, vinculo } = await pendenteComDocumento();
      const admin = await como(app, Role.ADMIN);

      const [aprovar, rejeitar] = await Promise.all([
        acao(operador.token, vinculo.id, 'approve'),
        acao(admin.token, vinculo.id, 'reject'),
      ]);

      expect([aprovar.status, rejeitar.status].sort((a, b) => a - b)).toEqual([
        200, 409,
      ]);
      expect(await situacaoNoBanco(vinculo.id)).toBe(
        aprovar.status === 200 ? 'ACTIVE' : 'REJECTED',
      );
    });

    it('várias aprovações simultâneas: só uma vale', async () => {
      const { operador, vinculo } = await pendenteComDocumento();

      const respostas = await Promise.all(
        Array.from({ length: 5 }, () =>
          acao(operador.token, vinculo.id, 'approve'),
        ),
      );

      const codigos = respostas.map((r) => r.status);
      expect(codigos.filter((c) => c === 200)).toHaveLength(1);
      expect(codigos.filter((c) => c === 409)).toHaveLength(4);
    });
  });

  // ---------------------------------------------------------------------------
  describe('efeito do vínculo no acesso do responsável aos dados do aluno', () => {
    it('fluxo completo: só enxerga o aluno depois da aprovação e perde o acesso ao revogar', async () => {
      const { aluno, dono } = await montar();
      const operador = await como(app, Role.OPERATOR);

      const criado = await api(app, operador.token)
        .post('/guardian-relations')
        .send({
          guardianId: dono.usuario.id,
          studentId: aluno.id,
          relationship: 'MOTHER',
        })
        .expect(201);
      const id = criado.body.id as string;
      const verAluno = () => api(app, dono.token).get(`/students/${aluno.id}`);
      const meusAlunos = () =>
        api(app, dono.token).get('/me/students').expect(200);

      // 1. Pendente e sem documento: nada de acesso.
      await verAluno().expect(403);
      expect((await meusAlunos()).body).toEqual([]);

      // 2. Documento enviado, mas ainda não analisado: continua sem acesso.
      await enviar(dono.token, id, PDF).expect(200);
      await verAluno().expect(403);
      expect((await meusAlunos()).body).toEqual([]);

      // 3. Aprovado: acesso liberado.
      await api(app, operador.token)
        .post(`/guardian-relations/${id}/approve`)
        .expect(200);
      const liberado = await verAluno().expect(200);
      expect(liberado.body.id).toBe(aluno.id);
      const lista = (await meusAlunos()).body as { id: string }[];
      expect(lista.map((a) => a.id)).toEqual([aluno.id]);

      // 4. Revogado: perde o acesso na hora.
      await api(app, operador.token)
        .post(`/guardian-relations/${id}/revoke`)
        .expect(200);
      await verAluno().expect(403);
      expect((await meusAlunos()).body).toEqual([]);
    });

    it('rejeição: o responsável lê o motivo, corrige o documento, e a aprovação libera o acesso', async () => {
      const { aluno, dono } = await montar();
      const operador = await como(app, Role.OPERATOR);
      const vinculo = await vinculoNoBanco(dono.usuario.id, aluno.id);
      await enviar(dono.token, vinculo.id, PDF).expect(200);

      await api(app, operador.token)
        .post(`/guardian-relations/${vinculo.id}/reject`)
        .send({ reason: 'Foto cortada, envie o documento inteiro' })
        .expect(200);
      const lido = await api(app, dono.token)
        .get(`/guardian-relations/${vinculo.id}`)
        .expect(200);
      expect(lido.body).toMatchObject({
        status: 'REJECTED',
        rejectionReason: 'Foto cortada, envie o documento inteiro',
      });
      await api(app, dono.token).get(`/students/${aluno.id}`).expect(403);

      await enviar(dono.token, vinculo.id, PNG, 'documento-inteiro.png').expect(
        200,
      );
      await api(app, operador.token)
        .post(`/guardian-relations/${vinculo.id}/approve`)
        .expect(200);

      await api(app, dono.token).get(`/students/${aluno.id}`).expect(200);
    });
  });
});
