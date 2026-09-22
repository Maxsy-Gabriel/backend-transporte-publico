# Avaliação de 5 Dias --- Transporte Escolar

## Contexto e objetivo

Projete e implemente uma API backend completa para **Transporte
Escolar**. A avaliação tem duração de **5 dias**. A solução será
observada pela modelagem, arquitetura, integração entre componentes,
regras de negócio, segurança, tratamento de erros, testes e qualidade da
entrega.

## Stack e conteúdos obrigatórios

-   NestJS + TypeScript
-   PostgreSQL
-   Prisma **7.10.0**, `prisma.config.ts`, driver adapter e migrations
-   DTOs, `class-validator` e `ValidationPipe`
-   JWT e `@CurrentUser()` ou mecanismo equivalente
-   autorização por papel/permissão
-   relacionamentos Prisma
-   upload de arquivo
-   `HttpService`
-   pelo menos um Interceptor útil
-   `.env` / `ConfigService`
-   Helmet
-   Compression
-   tratamento coerente de `400`, `401`, `403`, `404` e `409`
-   build de produção
-   README/documentação

## Perfis

GUARDIAN, DRIVER, OPERATOR, ADMIN.

Defina uma matriz de permissões coerente. Usuários não podem manipular
recursos de terceiros apenas alterando IDs na requisição.

## Entidades mínimas

User, Student, GuardianRelation, Route, Vehicle, Driver, BoardingRecord.

Modele cardinalidades, constraints, enums e estados necessários. É
permitido criar entidades associativas e auxiliares.

## Funcionalidades mínimas

-   autenticação;
-   CRUD/gestão das entidades administrativas relevantes;
-   operações do usuário autenticado;
-   consultas por relacionamento;
-   fluxo de estados do domínio;
-   histórico quando necessário;
-   autorização;
-   validações;
-   tratamento dos conflitos de negócio.

## Regras obrigatórias

Capacidade da rota/veículo; responsável só acessa vinculados; embarque
precede desembarque; motorista só opera sua rota.

Além dessas regras:

-   referências a recursos inexistentes devem ser tratadas;
-   operações incompatíveis com o estado atual devem ser rejeitadas;
-   transições de status precisam ser coerentes;
-   dados sensíveis não podem aparecer nas respostas;
-   operações pessoais devem usar a identidade autenticada.

## Endpoints

Defina uma API REST suficiente para executar **todos os fluxos
descritos**. O README deve listar método, URL, autenticação/permissão,
body esperado e principais respostas de cada endpoint.

## Upload obrigatório

Implemente upload de **documento autorizado**. Valide presença, tamanho
e tipo do arquivo. O upload deve estar conectado a uma funcionalidade
real do domínio.

## Integração externa

Utilize `HttpService` para consumir **CEP/geocodificação de pontos**.
URL/configurações devem vir do ambiente e erros/timeout precisam ser
tratados. Pode ser utilizada uma API mock disponibilizada para a
avaliação quando necessário.

## Interceptor

Implemente pelo menos um Interceptor coerente, como:

-   log estruturado;
-   tempo de execução;
-   transformação padronizada da resposta.

Documente sua finalidade. Não coloque regra principal de negócio no
Interceptor.

## Segurança e performance

-   JWT secret por ambiente;
-   `.env` fora do Git;
-   Helmet habilitado;
-   Compression habilitado;
-   rotas privadas protegidas;
-   autorização testada;
-   logs sem segredos;
-   senhas nunca retornadas.

## Testes obrigatórios

Demonstre:

1.  fluxo principal com sucesso;
2.  body inválido → `400`;
3.  ausência/token inválido → `401`;
4.  usuário autenticado sem permissão → `403`;
5.  recurso inexistente → `404`;
6.  conflito da regra de negócio → `409`;
7.  tentativa de acesso a recurso de terceiro;
8.  upload válido e inválido;
9.  integração externa funcionando e falhando de forma controlada;
10. fluxo completo de mudança de estado.

## Entregáveis

-   código-fonte;
-   schema Prisma e migrations;
-   `.env.example`;
-   README completo;
-   documentação/lista de endpoints;
-   exemplos de requisição;
-   instruções de instalação, migration, execução e build;
-   `npm run build` finalizando sem erros.

## Bônus

Somente depois do obrigatório: paginação, filtros, ordenação, Swagger,
seed, testes automatizados, Docker ou indicadores do domínio.
