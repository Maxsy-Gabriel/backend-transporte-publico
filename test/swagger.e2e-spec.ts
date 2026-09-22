import type { INestApplication } from '@nestjs/common';
import { api, createApp } from './create-app.js';

/**
 * A documentação (Swagger/OpenAPI) é servida por rotas próprias do SwaggerModule, por fora do
 * pipeline de guards do Nest — por isso os testes aqui usam `api(app).cru()` (sem X-API-KEY)
 * para provar que ela é mesmo pública, ao contrário de toda outra rota da API.
 */
describe('Documentação (Swagger/OpenAPI)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(async () => {
    await app.close();
  });

  describe('GET /docs-json (o schema OpenAPI)', () => {
    it('responde sem exigir X-API-KEY nem token (200, JSON)', async () => {
      const res = await api(app).cru().get('/docs-json').expect(200);

      expect(res.headers['content-type']).toContain('application/json');
    });

    it('é um documento OpenAPI 3.x válido, com título e versão', async () => {
      const res = await api(app).cru().get('/docs-json').expect(200);

      expect(res.body.openapi).toMatch(/^3\./);
      expect(res.body.info).toMatchObject({
        title: 'API Transporte Escolar',
        version: '1.0',
      });
    });

    it('lista os endpoints reais da API (uma amostra de cada módulo)', async () => {
      const res = await api(app).cru().get('/docs-json').expect(200);
      const caminhos = Object.keys(res.body.paths);

      for (const esperado of [
        '/auth/login',
        '/auth/register',
        '/me',
        '/users',
        '/vehicles',
        '/vehicles/{id}',
        '/drivers/{id}/routes',
        '/routes',
        '/routes/{routeId}/stops',
        '/students/{id}/route',
        '/guardian-relations/{id}/document',
        '/routes/{routeId}/trips',
        '/trips/{id}/finish',
        '/trips/{tripId}/boardings',
        '/boardings/{id}/alight',
        '/students/{id}/boardings',
      ]) {
        expect(caminhos).toContain(esperado);
      }
      // Documento robusto, não um esqueleto: bate (aproximadamente) com a contagem real de rotas.
      expect(caminhos.length).toBeGreaterThanOrEqual(35);
    });

    it('declara os dois esquemas de segurança (bearer e apiKey) e exige os dois por padrão', async () => {
      const res = await api(app).cru().get('/docs-json').expect(200);

      expect(res.body.components.securitySchemes).toMatchObject({
        bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        apiKey: { type: 'apiKey', in: 'header', name: 'x-api-key' },
      });
      expect(res.body.security).toEqual([{ bearer: [], apiKey: [] }]);
    });

    it('o documento inteiro não contém nenhum segredo do ambiente (chave, senha do seed)', async () => {
      const res = await api(app).cru().get('/docs-json').expect(200);
      const texto = JSON.stringify(res.body);

      expect(texto).not.toContain(process.env.API_KEY);
      expect(texto).not.toMatch(/passwordHash|SEED_ADMIN_PASSWORD/);
    });

    it('todo grupo (tag) usado pelos endpoints tem uma descrição', async () => {
      const res = await api(app).cru().get('/docs-json').expect(200);
      const tagsUsadas = new Set<string>();
      for (const item of Object.values(res.body.paths) as Record<
        string,
        { tags?: string[] }
      >[]) {
        for (const operacao of Object.values(item)) {
          for (const tag of operacao.tags ?? []) tagsUsadas.add(tag);
        }
      }
      const tagsDocumentadas = new Map(
        (res.body.tags as { name: string; description: string }[]).map((t) => [
          t.name,
          t.description,
        ]),
      );

      expect(tagsUsadas.size).toBeGreaterThanOrEqual(10);
      for (const tag of tagsUsadas) {
        expect(tagsDocumentadas.has(tag)).toBe(true);
        expect(tagsDocumentadas.get(tag)?.length).toBeGreaterThan(10);
      }
    });

    it('toda operação tem summary, e toda resposta documentada tem description', async () => {
      const res = await api(app).cru().get('/docs-json').expect(200);
      const problemas: string[] = [];
      for (const [caminho, item] of Object.entries(res.body.paths) as [
        string,
        Record<
          string,
          {
            summary?: string;
            responses?: Record<string, { description?: string }>;
          }
        >,
      ][]) {
        for (const [metodo, operacao] of Object.entries(item)) {
          if (!operacao.summary)
            problemas.push(`${metodo.toUpperCase()} ${caminho} sem summary`);
          for (const [codigo, resposta] of Object.entries(
            operacao.responses ?? {},
          )) {
            if (!resposta.description)
              problemas.push(
                `${metodo.toUpperCase()} ${caminho} ${codigo} sem description`,
              );
          }
        }
      }
      expect(problemas).toEqual([]);
    });

    it('nenhum DTO de corpo fica com o schema vazio (todo campo tem @ApiProperty)', async () => {
      const res = await api(app).cru().get('/docs-json').expect(200);
      const vazios = Object.entries(
        res.body.components.schemas as Record<
          string,
          { properties?: Record<string, unknown> }
        >,
      )
        .filter(
          ([, schema]) =>
            schema.properties && Object.keys(schema.properties).length === 0,
        )
        .map(([nome]) => nome);

      expect(vazios).toEqual([]);
    });

    it('um DTO de exemplo (criar veículo) tem descrição e exemplo em cada campo', async () => {
      const res = await api(app).cru().get('/docs-json').expect(200);
      const schema = res.body.components.schemas.CreateVehicleDto;

      expect(schema.properties.plate).toMatchObject({ example: 'ABC1D23' });
      expect(schema.properties.plate.description.length).toBeGreaterThan(10);
      expect(schema.properties.capacity).toMatchObject({
        minimum: 1,
        maximum: 100,
        example: 15,
      });
      expect(schema.required).toEqual(
        expect.arrayContaining(['plate', 'model', 'capacity']),
      );
    });

    it('a regra de capacidade (409) aparece documentada na alocação de rota do aluno', async () => {
      const res = await api(app).cru().get('/docs-json').expect(200);
      const operacao = res.body.paths['/students/{id}/route'].patch;

      expect(operacao.responses['409'].description).toMatch(
        /lotada|capacidade/i,
      );
      expect(operacao.responses).toHaveProperty('400');
      expect(operacao.responses).toHaveProperty('401');
      expect(operacao.responses).toHaveProperty('403');
      expect(operacao.responses).toHaveProperty('404');
    });

    it('o upload do documento é documentado como multipart/form-data, com o campo "file" binário', async () => {
      const res = await api(app).cru().get('/docs-json').expect(200);
      const operacao = res.body.paths['/guardian-relations/{id}/document'].post;

      expect(Object.keys(operacao.requestBody.content)).toEqual([
        'multipart/form-data',
      ]);
      expect(
        operacao.requestBody.content['multipart/form-data'].schema.properties
          .file,
      ).toMatchObject({
        type: 'string',
        format: 'binary',
      });
      expect(operacao.responses).toHaveProperty('413'); // limite de tamanho
    });

    it('o login documenta um exemplo de accessToken, e o registro nunca expõe passwordHash', async () => {
      const res = await api(app).cru().get('/docs-json').expect(200);
      const login = res.body.paths['/auth/login'].post;
      const registro = res.body.paths['/auth/register'].post;

      expect(
        login.responses['200'].content['application/json'].schema.example,
      ).toMatchObject({
        tokenType: 'Bearer',
      });
      const exemploRegistro =
        registro.responses['201'].content['application/json'].schema.example;
      expect(exemploRegistro).not.toHaveProperty('passwordHash');
      expect(exemploRegistro).not.toHaveProperty('password');
    });
  });

  describe('GET /docs (a página do Swagger UI)', () => {
    it('responde sem exigir X-API-KEY nem token (200, HTML)', async () => {
      const res = await api(app).cru().get('/docs').expect(200);

      expect(res.headers['content-type']).toContain('text/html');
      expect(res.text).toContain('swagger-ui');
    });

    it('não tem Content-Security-Policy (senão a própria página do Swagger quebraria)', async () => {
      const res = await api(app).cru().get('/docs').expect(200);

      expect(res.headers['content-security-policy']).toBeUndefined();
    });

    it('mesmo sem CSP, continua com as outras proteções do Helmet', async () => {
      const res = await api(app).cru().get('/docs').expect(200);

      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBeDefined();
    });

    it('uma rota comum continua com a CSP normal (a exceção é só do /docs)', async () => {
      const res = await api(app).cru().get('/nao-existe');

      expect(res.headers['content-security-policy']).toBeDefined();
    });
  });
});
