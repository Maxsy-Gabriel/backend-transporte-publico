import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { API_KEY_HEADER } from './auth/guards/api-key.guard.js';

const helmetPadrao = helmet();
// O Swagger UI monta a página com um script inline: a CSP padrão (bem restrita) bloquearia
// esse script e a página ficaria em branco. Só aqui ela fica de fora; as outras proteções do
// Helmet (nosniff, frameguard, HSTS...) continuam valendo normalmente, inclusive em /docs.
const helmetSemCsp = helmet({ contentSecurityPolicy: false });

/**
 * Aplica o Helmet padrão em toda a API, e uma versão sem CSP só em `/docs*` (a documentação
 * e o JSON/YAML do Swagger). Usada tanto em `main.ts` quanto nos testes e2e, para as duas
 * baterem exatamente no mesmo comportamento.
 */
export function helmetComExcecaoParaOSwagger(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  (req.path.startsWith('/docs') ? helmetSemCsp : helmetPadrao)(req, res, next);
}

/**
 * Documentação OpenAPI (Swagger). As rotas que ela cria (`/docs`, `/docs-json`, `/docs-yaml`)
 * são registradas direto no adaptador HTTP, por fora do pipeline de guards do Nest: por
 * decisão do usuário, ficam PÚBLICAS (sem exigir `X-API-KEY`) — é preciso ler a documentação
 * antes mesmo de ter credenciais, e um navegador comum não manda cabeçalhos customizados só
 * ao abrir um link. Nenhum dado real é exposto ali, só a descrição dos endpoints.
 *
 * Testar um endpoint PELA página (botão "Try it out") continua exigindo a chave e o token,
 * preenchidos no botão "Authorize" — a API de verdade, por trás, segue com os mesmos guards.
 */
export function configurarSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('API Transporte Escolar')
    .setDescription(
      'Gestão de veículos, motoristas, rotas e paradas, alunos, vínculos responsável-aluno ' +
        '(com upload do documento de autorização) e o dia a dia das viagens: início, embarque, ' +
        'desembarque, finalização e histórico.\n\n' +
        `Toda rota exige o cabeçalho \`${API_KEY_HEADER}\`. A maioria também exige um token ` +
        'JWT (`Authorization: Bearer <token>`), obtido em `POST /auth/login`. Preencha os dois ' +
        'no botão "Authorize" para testar os endpoints por aqui.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'bearer',
    )
    .addApiKey({ type: 'apiKey', in: 'header', name: API_KEY_HEADER }, 'apiKey')
    .addTag(
      'Autenticação',
      'Cadastro de responsável e login. Únicas rotas @Public (sem JWT).',
    )
    .addTag(
      'Meu perfil',
      'Operações do próprio usuário autenticado, qualquer papel (id sempre vem do token).',
    )
    .addTag(
      'Usuários (admin)',
      'Cadastro e gestão de contas com qualquer papel. Só ADMIN.',
    )
    .addTag('Veículos', 'Gestão da frota. Secretaria (OPERATOR) e ADMIN.')
    .addTag(
      'Motoristas',
      'Perfis de motorista (CNH, situação). Secretaria e ADMIN.',
    )
    .addTag('Rotas', 'Cadastro, ativação/desativação e consulta de rotas.')
    .addTag(
      'Paradas',
      'Pontos de parada de uma rota, com endereço resolvido por CEP (BrasilAPI).',
    )
    .addTag(
      'Alunos',
      'Cadastro, alocação em rota (com a regra de capacidade) e histórico.',
    )
    .addTag(
      'Vínculos responsável-aluno',
      'Vínculo, documento de autorização (upload) e aprovação pela secretaria.',
    )
    .addTag(
      'Viagens',
      'Início, consulta e finalização das viagens de uma rota.',
    )
    .addTag(
      'Embarque e desembarque',
      'Registro de quem sobe e desce durante uma viagem em andamento.',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  // Exige os dois esquemas em toda rota por padrão (é a regra real da API); mais simples do
  // que decorar cada um dos handlers com @ApiBearerAuth/@ApiSecurity um por um.
  document.security = [{ bearer: [], apiKey: [] }];

  SwaggerModule.setup('docs', app, document, {
    // Mantém a chave/token preenchidos entre uma chamada e outra, só durante a sessão do navegador.
    swaggerOptions: { persistAuthorization: true },
  });
}
