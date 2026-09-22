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
