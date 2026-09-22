# API Transporte Escolar (AV-09)

API backend para gestão de transporte escolar: veículos, motoristas, rotas e
paradas, alunos, vínculos responsável-aluno (com upload do documento de
autorização) e o dia a dia das viagens (início, embarque, desembarque,
finalização e histórico).

Stack: **NestJS 12** (ESM) + **TypeScript** + **PostgreSQL** + **Prisma
7.10.0** (driver adapter `@prisma/adapter-pg`), autenticação **JWT**,
`class-validator`, **Helmet**, **Compression**, upload com validação por
assinatura de arquivo (magic bytes), integração com a **BrasilAPI** (CEP/geo)
via `HttpService`, documentação **Swagger/OpenAPI**, testes automatizados com
**Vitest** (unitários + e2e contra um Postgres real).

Este guia assume uma máquina **zerada**: só com [VS Code](https://code.visualstudio.com/),
[Git](https://git-scm.com/) e [PostgreSQL](https://www.postgresql.org/download/)
instalados. Todo o resto (Node, dependências) é instalado nos passos abaixo.

---

## Sumário

- [1. Pré-requisitos](#1-pré-requisitos)
- [2. Primeira instalação (passo a passo)](#2-primeira-instalação-passo-a-passo)
- [3. Rodando a aplicação](#3-rodando-a-aplicação)
- [4. Testes automatizados](#4-testes-automatizados)
- [5. Documentação interativa (Swagger)](#5-documentação-interativa-swagger)
- [6. Variáveis de ambiente](#6-variáveis-de-ambiente)
- [7. Modelo de dados](#7-modelo-de-dados)
- [8. Perfis e matriz de permissões](#8-perfis-e-matriz-de-permissões)
- [9. Endpoints](#9-endpoints)
- [10. Exemplos de requisição (fluxo completo por curl)](#10-exemplos-de-requisição-fluxo-completo-por-curl)
- [11. Upload de documento](#11-upload-de-documento)
- [12. Integração externa (CEP/geocodificação)](#12-integração-externa-cepgeocodificação)
- [13. Erros e códigos HTTP](#13-erros-e-códigos-http)
- [14. Decisões de projeto e limitações conhecidas](#14-decisões-de-projeto-e-limitações-conhecidas)
- [15. Build de produção](#15-build-de-produção)
- [16. Solução de problemas comuns](#16-solução-de-problemas-comuns)

---

## 1. Pré-requisitos

| Ferramenta | Versão                                                   | Como conferir    | Como instalar                                                                                                                                    |
| ---------- | -------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Node.js    | **22.12 ou superior** (o projeto usa a 24, ver `.nvmrc`) | `node -v`        | https://nodejs.org (ou `nvm install` se você usa [nvm](https://github.com/nvm-sh/nvm)/[nvm-windows](https://github.com/coreybutler/nvm-windows)) |
| npm        | instalado junto com o Node                               | `npm -v`         | —                                                                                                                                                |
| PostgreSQL | 14 ou superior (testado na 18)                           | `psql --version` | https://www.postgresql.org/download/                                                                                                             |
| Git        | qualquer versão recente                                  | `git --version`  | https://git-scm.com                                                                                                                              |

Você **não** precisa instalar Nest CLI, Prisma CLI nem nada global: tudo roda
via `npm run <script>`, usando as versões exatas travadas no `package.json`
deste projeto.

Docker é **opcional** e não é necessário para nada abaixo — o projeto não usa
Docker nesta entrega (infraestrutura fica fora de escopo desta fase).

---

## 2. Primeira instalação (passo a passo)

### 2.1. Clonar e instalar as dependências

```bash
git clone <url-do-repositório>
cd avaliacao-backend
npm install
```

O `npm install` já roda `prisma generate` sozinho (script `postinstall`), que
gera o Prisma Client em `src/generated/prisma` — essa pasta **não** é
versionada, é sempre recriada localmente.

### 2.2. Criar os bancos de dados PostgreSQL

Você precisa de **dois bancos**: um para desenvolvimento e um para os testes
automatizados. Rodam no mesmo servidor Postgres, só muda o nome do banco (e o
usuário da aplicação, por boa prática, não é o superusuário `postgres`).

Abra um terminal com o `psql` (ajuste o caminho se o Postgres não estiver no
`PATH` — no Windows costuma ser algo como
`"C:\Program Files\PostgreSQL\18\bin\psql.exe"`):

```bash
psql -U postgres -h localhost
```

Dentro do `psql`, crie uma role dedicada para a aplicação (troque a senha por
uma sua) e os dois bancos:

```sql
CREATE ROLE transporte_app WITH LOGIN PASSWORD 'escolha-uma-senha-forte' CREATEDB;
CREATE DATABASE transporte_escolar      OWNER transporte_app;
CREATE DATABASE transporte_escolar_test OWNER transporte_app;
\q
```

> `CREATEDB` é necessário porque o `prisma migrate dev` cria um "shadow
> database" temporário para detectar conflitos de migration — isso só
> acontece em desenvolvimento, nunca em produção (`migrate deploy` não
> precisa disso).

### 2.3. Configurar as variáveis de ambiente

Copie os dois arquivos de exemplo e ajuste os valores:

```bash
# Linux/macOS
cp .env.example .env
cp .env.example .env.test

# Windows (PowerShell)
copy .env.example .env
copy .env.example .env.test
```

Edite o `.env` (desenvolvimento):

```ini
NODE_ENV=development
DATABASE_URL=postgresql://transporte_app:escolha-uma-senha-forte@localhost:5432/transporte_escolar
JWT_SECRET=<gere um valor — veja abaixo>
API_KEY=<gere um valor — veja abaixo>
SEED_ADMIN_EMAIL=admin@transporte.local
SEED_ADMIN_PASSWORD=<uma senha sua, com pelo menos 12 caracteres>
```

E o `.env.test` (usado só pelos testes automatizados, aponta para o banco de
teste):

```ini
NODE_ENV=test
DATABASE_URL=postgresql://transporte_app:escolha-uma-senha-forte@localhost:5432/transporte_escolar_test
JWT_SECRET=<gere outro valor, diferente do de dev>
API_KEY=<gere outro valor, diferente do de dev>
SEED_ADMIN_EMAIL=admin@teste.local
SEED_ADMIN_PASSWORD=senha-de-teste-qualquer-com-12-chars
```

`JWT_SECRET` e `API_KEY` precisam ter **pelo menos 32 caracteres** e devem ser
**diferentes em cada ambiente** (a aplicação recusa subir sem isso — ver
[seção 6](#6-variáveis-de-ambiente)). Gere valores aleatórios com:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Rode o comando **duas vezes para cada arquivo** (uma para `JWT_SECRET`, outra
para `API_KEY`), copiando um valor diferente para cada variável, em cada um
dos dois arquivos.

> Os arquivos `.env` e `.env.test` nunca são commitados (estão no
> `.gitignore`). O `.env.example` só tem valores de exemplo, nenhum segredo
> real.

### 2.4. Aplicar as migrations

```bash
# banco de desenvolvimento
npm run db:migrate

# banco de teste
npm run db:migrate:test
```

`npm run db:migrate` (`prisma migrate dev`) cria as tabelas no banco de dev a
partir de `prisma/schema.prisma` + `prisma/migrations/`. `db:migrate:test` usa
`prisma migrate deploy` (sem prompts) contra o `.env.test`.

### 2.5. Criar o administrador inicial (seed)

```bash
npm run db:seed
```

Cria o usuário ADMIN definido em `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` do
seu `.env`. É **necessário**: o cadastro público (`POST /auth/register`) só
cria responsáveis (GUARDIAN) — motoristas e operadores só são criados por um
ADMIN já autenticado, então sem esse passo não há como entrar no sistema.

O comando é idempotente: se o e-mail já existe, não faz nada (não sobrescreve
a senha).

Pronto — a instalação está completa. Siga para a seção 3 para subir a API.

---

## 3. Rodando a aplicação

```bash
# modo desenvolvimento, com reload automático
npm run start:dev

# modo padrão, sem watch
npm run start

# produção (precisa buildar antes — ver seção 15)
npm run build
npm run start:prod
```

Por padrão a API sobe em `http://localhost:3000` (variável `PORT`, ver
seção 6). Sem prefixo de rota: `POST /auth/login`, não `/api/v1/auth/login`.

Teste rapidamente que subiu:

```bash
curl -i http://localhost:3000/docs -H "Content-Type: application/json"
```

Deve responder `200` com HTML contendo `swagger-ui` (a documentação é a única
rota pública sem necessidade de cabeçalhos — ver seção 5).

---

## 4. Testes automatizados

```bash
# testes unitários (não tocam no banco)
npm run test

# testes end-to-end (usam o banco de teste real, via .env.test)
npm run test:e2e

# cobertura
npm run test:cov
```

Os testes e2e sobem a aplicação de verdade (mesmos guards, filtros,
interceptor e Swagger do `main.ts`) e batem no PostgreSQL do `.env.test` —
por isso o passo 2.4 (`db:migrate:test`) é obrigatório antes de rodá-los. Eles
rodam em série (não em paralelo) porque compartilham o mesmo banco.

Estado atual do projeto: **22 testes unitários + 667 testes e2e**, incluindo:

- os 10 cenários obrigatórios do enunciado (`test/mandatory-scenarios.e2e-spec.ts`);
- uma matriz sistemática de permissões cobrindo ~50 rotas × 4 perfis
  (`test/permission-matrix.e2e-spec.ts`);
- testes de concorrência (requisições simultâneas) para capacidade de rota,
  embarque/desembarque e aprovação de vínculo;
- testes estruturais do documento Swagger/OpenAPI gerado (nenhuma operação
  sem descrição, nenhuma resposta sem descrição, nenhum schema vazio).

---

## 5. Documentação interativa (Swagger)

Com a aplicação rodando, acesse:

```
http://localhost:3000/docs
```

`/docs`, `/docs-json` e `/docs-yaml` são as únicas rotas **públicas** da API
(sem exigir `X-API-KEY` nem token) — são geradas pelo próprio `SwaggerModule`
e ficam fora do pipeline de guards, para que a documentação possa ser lida
antes mesmo de se ter credenciais.

Para **testar** um endpoint pela própria página (botão _Try it out_), clique
em **Authorize** (canto superior direito) e preencha:

- `apiKey`: o valor da sua variável `API_KEY`;
- `bearer`: um token JWT obtido em `POST /auth/login` (só o token, sem a
  palavra `Bearer`).

Toda a API está documentada ali: método, parâmetros, corpo esperado (com
exemplo), e todas as respostas possíveis por código HTTP, com exemplo e
descrição de cada uma.

---

## 6. Variáveis de ambiente

Veja o arquivo [`.env.example`](.env.example) (comentado) para a lista
completa com descrição de cada uma. A aplicação **valida** todas elas na
inicialização (`src/config/env.validation.ts`) e recusa subir se algo estiver
ausente ou fora do formato — a mensagem cita só o _nome_ da variável, nunca o
valor, para não vazar segredo em log.

| Variável              | Obrigatória             | Padrão                                | Descrição                                                                                    |
| --------------------- | ----------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------- |
| `NODE_ENV`            | sim                     | —                                     | `development`, `test` ou `production`.                                                       |
| `PORT`                | não                     | `3000`                                | Porta HTTP.                                                                                  |
| `DATABASE_URL`        | sim                     | —                                     | Conexão PostgreSQL (`postgresql://usuario:senha@host:porta/banco`).                          |
| `JWT_SECRET`          | sim                     | —                                     | Assinatura do JWT. Mínimo 32 caracteres, diferente por ambiente.                             |
| `JWT_EXPIRES_IN`      | não                     | `1h`                                  | Duração do token (`15m`, `1h`, `7d`...).                                                     |
| `API_KEY`             | sim                     | —                                     | Exigida no cabeçalho `X-API-KEY` em toda rota. Mínimo 32 caracteres, diferente por ambiente. |
| `CEP_API_BASE_URL`    | não                     | `https://brasilapi.com.br/api/cep/v2` | Base da API de CEP/geocodificação.                                                           |
| `CEP_API_TIMEOUT_MS`  | não                     | `5000`                                | Timeout da chamada de CEP, em ms.                                                            |
| `UPLOAD_DIR`          | não                     | `./storage/uploads`                   | Pasta onde os documentos enviados são gravados.                                              |
| `UPLOAD_MAX_BYTES`    | não                     | `5242880` (5 MB)                      | Tamanho máximo de upload aceito.                                                             |
| `SEED_ADMIN_NAME`     | não                     | `Administrador`                       | Nome do admin criado pelo seed.                                                              |
| `SEED_ADMIN_EMAIL`    | sim (para rodar o seed) | —                                     | E-mail do admin inicial.                                                                     |
| `SEED_ADMIN_PASSWORD` | sim (para rodar o seed) | —                                     | Senha do admin inicial (mínimo 12 caracteres).                                               |

Em `NODE_ENV=production`, `JWT_SECRET` e `API_KEY` iguais ao valor de exemplo
(`...change-me...`) são **recusados** — a aplicação não sobe.

---

## 7. Modelo de dados

Schema completo em [`prisma/schema.prisma`](prisma/schema.prisma); histórico
de migrations em [`prisma/migrations/`](prisma/migrations/).

| Entidade             | Resumo                                                                                                                                                                                                                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **User**             | Conta de acesso (e-mail único, senha com argon2id). `role`: `GUARDIAN`\|`DRIVER`\|`OPERATOR`\|`ADMIN`. `active`: true/false (desativação lógica, nunca delete).                                                                                                                           |
| **Driver**           | Perfil de motorista, 1:1 com um `User` de papel `DRIVER`. CNH (`licenseNumber` único), categoria e validade (`licenseExpiresAt`) — checada a cada ativação de rota **e** a cada início de viagem.                                                                                         |
| **Vehicle**          | Veículo (`plate` única), com `capacity` (define o limite de alunos por rota).                                                                                                                                                                                                             |
| **Route**            | Rota (turno `MORNING`\|`AFTERNOON`\|`EVENING`), estado `DRAFT → ACTIVE ↔ INACTIVE`. Ativar exige veículo, motorista com CNH válida e ao menos um ponto. Não pode ser desativada com viagem em andamento.                                                                                  |
| **RouteStop**        | Ponto de parada de uma rota, endereço resolvido por CEP (BrasilAPI), com latitude/longitude opcionais.                                                                                                                                                                                    |
| **Student**          | Aluno; no máximo em **uma** rota por vez (`routeId`/`stopId` opcionais). Alocação respeita a capacidade do veículo (checada com trava de linha para concorrência).                                                                                                                        |
| **GuardianRelation** | Vínculo responsável↔aluno + documento de autorização (upload). Fluxo: `PENDING → ACTIVE\|REJECTED`; `ACTIVE → REVOKED`; `REJECTED → PENDING` (reenvio). Um vínculo `REVOKED` pode ser recriado (novo registro; o antigo continua na tabela como histórico, com seu próprio `reviewedAt`). |
| **Trip**             | Viagem de uma rota: `IN_PROGRESS → FINISHED`. No máximo uma em andamento por rota (índice único parcial). CNH checada de novo ao iniciar.                                                                                                                                                 |
| **BoardingRecord**   | Embarque/desembarque de um aluno numa viagem: `BOARDED → ALIGHTED`. Embarque exige viagem em andamento, aluno ativo alocado naquela rota, e nenhum embarque em aberto já existente para o aluno (índice único parcial).                                                                   |

Regras de integridade reforçadas também no **banco** (não só na aplicação):
`CHECK` de capacidade positiva, `CHECK` de coerência de status/timestamps
(ex.: `alightedAt >= boardedAt`, viagem só termina depois de começar), e
índices únicos (inclusive parciais) para as invariantes "só um X em aberto
por vez".

---

## 8. Perfis e matriz de permissões

Quatro perfis: **GUARDIAN** (responsável), **DRIVER** (motorista),
**OPERATOR** (secretaria) e **ADMIN**.

Toda rota exige `X-API-KEY` + (exceto login/cadastro) um token JWT válido.
Toda rota autenticada exige um papel explícito — não existe rota "esquecida"
sem checagem: isso é garantido por um teste automatizado que varre todos os
controllers (`test/permission-matrix.e2e-spec.ts`).

Acesso a **recurso de terceiro** (ex.: motorista tentando ver a rota de
outro, responsável tentando ver aluno sem vínculo `ACTIVE`) é sempre
**403**, nunca vazado por manipulação de ID.

| Recurso                                                     |          GUARDIAN          |            DRIVER             |  OPERATOR  |   ADMIN    |
| ----------------------------------------------------------- | :------------------------: | :---------------------------: | :--------: | :--------: |
| Cadastro / login                                            |          público           |            público            |  público   |  público   |
| `/me`, `/me/password`                                       |             ✅             |              ✅               |     ✅     |     ✅     |
| `/me/students` (meus vínculos)                              |             ✅             |               –               |     –      |     –      |
| `/me/routes` (minhas rotas)                                 |             –              |              ✅               |     –      |     –      |
| Usuários (gestão de contas)                                 |             –              |               –               |     –      |     ✅     |
| Veículos / Motoristas (gestão)                              |             –              |               –               |     ✅     |     ✅     |
| Rotas / Paradas — escrita                                   |             –              |               –               |     ✅     |     ✅     |
| Rotas / Paradas — leitura                                   |             –              |              ✅               |     ✅     |     ✅     |
| Alunos — escrita (cadastro, alocação)                       |             –              |               –               |     ✅     |     ✅     |
| Alunos — leitura de um específico                           | só se vinculado (`ACTIVE`) | só se matriculado na sua rota |     ✅     |     ✅     |
| Vínculos responsável-aluno — criar/aprovar/rejeitar/revogar |             –              |               –               |     ✅     |     ✅     |
| Vínculos — ver/listar os próprios                           |      ✅ (só os seus)       |               –               | ✅ (todos) | ✅ (todos) |
| Upload do documento do vínculo                              |    ✅ (só o seu, dono)     |               –               |     –      |     –      |
| Download do documento do vínculo                            |       ✅ (só o seu)        |               –               |     ✅     |     ✅     |
| Iniciar/finalizar viagem, embarcar/desembarcar aluno        |             –              |    ✅ (só a própria rota)     |     –      |     –      |
| Viagens / embarques — consulta                              |            ✅¹             |      ✅ (só as próprias)      | ✅ (todas) | ✅ (todas) |
| Histórico do aluno (`/students/:id/boardings`)              |      só se vinculado       | só se matriculado na sua rota |     ✅     |     ✅     |

¹ Responsável não tem uma rota dedicada de "listar viagens"; o histórico do
próprio filho é acessado por `GET /students/:id/boardings`.

Referência 1:1 código↔matriz: [`test/permission-matrix.e2e-spec.ts`](test/permission-matrix.e2e-spec.ts)
testa exatamente esta tabela, rota por rota.

---

## 9. Endpoints

Documentação interativa completa (com exemplo de corpo e de cada resposta):
[seção 5](#5-documentação-interativa-swagger) (`/docs`). A tabela abaixo é a
referência rápida exigida pelo enunciado — método, URL, permissão, corpo e
principais respostas.

Convenções: `id`/`:id` são sempre UUID (`400` se malformado). Toda rota
abaixo (exceto as duas de autenticação) exige `X-API-KEY` **e** token JWT.
Listagens são paginadas (`?page=1&limit=20`, `limit` máximo 100).

### Autenticação (públicas, exigem só `X-API-KEY`)

| Método | URL              | Corpo                                                                            | Respostas                                                                                         |
| ------ | ---------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| POST   | `/auth/register` | `{ name, email, password }` (cria sempre um `GUARDIAN`; `role` no corpo → `400`) | `201` usuário criado · `400` corpo inválido · `409` e-mail já existe                              |
| POST   | `/auth/login`    | `{ email, password }`                                                            | `200` `{ accessToken, tokenType: "Bearer" }` · `400` corpo inválido · `401` credenciais inválidas |

### Meu perfil (qualquer autenticado)

| Método | URL            | Papel    | Corpo                              | Respostas                                |
| ------ | -------------- | -------- | ---------------------------------- | ---------------------------------------- |
| GET    | `/me`          | qualquer | –                                  | `200` meu perfil                         |
| PATCH  | `/me`          | qualquer | `{ name?, phone? }`                | `200` atualizado · `400`                 |
| PATCH  | `/me/password` | qualquer | `{ currentPassword, newPassword }` | `204` · `400` · `401` senha atual errada |
| GET    | `/me/students` | GUARDIAN | –                                  | `200` meus vínculos com alunos           |
| GET    | `/me/routes`   | DRIVER   | –                                  | `200` minhas rotas                       |

### Usuários (ADMIN)

| Método | URL          | Corpo                               | Respostas                                                                      |
| ------ | ------------ | ----------------------------------- | ------------------------------------------------------------------------------ |
| POST   | `/users`     | `{ name, email, password, role }`   | `201` · `400` · `409` e-mail já existe                                         |
| GET    | `/users`     | query `page`, `limit`               | `200` página de usuários                                                       |
| GET    | `/users/:id` | –                                   | `200` · `404`                                                                  |
| PATCH  | `/users/:id` | `{ name?, phone?, role?, active? }` | `200` · `400` · `404` · `409` (ex.: desativar motorista que conduz rota ativa) |

### Veículos (OPERATOR, ADMIN)

| Método | URL                    | Corpo                            | Respostas                                                                          |
| ------ | ---------------------- | -------------------------------- | ---------------------------------------------------------------------------------- |
| POST   | `/vehicles`            | `{ plate, model, capacity }`     | `201` · `400` · `409` placa já existe                                              |
| GET    | `/vehicles`            | query `page`, `limit`, `status?` | `200`                                                                              |
| GET    | `/vehicles/:id`        | –                                | `200` · `404`                                                                      |
| PATCH  | `/vehicles/:id`        | `{ model?, capacity?, status? }` | `200` · `400` · `404` · `409` (reduzir capacidade abaixo do nº de alunos alocados) |
| GET    | `/vehicles/:id/routes` | –                                | `200` rotas que usam este veículo · `404`                                          |

### Motoristas (OPERATOR, ADMIN)

| Método | URL                   | Corpo                                                                                                       | Respostas                                                          |
| ------ | --------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| POST   | `/drivers`            | `{ userId, licenseNumber, licenseCategory, licenseExpiresAt }` (o `User` referenciado precisa ser `DRIVER`) | `201` · `400` · `404` usuário não existe · `409` CNH já cadastrada |
| GET    | `/drivers`            | query `page`, `limit`, `status?`                                                                            | `200`                                                              |
| GET    | `/drivers/:id`        | –                                                                                                           | `200` · `404`                                                      |
| PATCH  | `/drivers/:id`        | `{ licenseNumber?, licenseCategory?, licenseExpiresAt?, status? }`                                          | `200` · `400` · `404` · `409`                                      |
| GET    | `/drivers/:id/routes` | –                                                                                                           | `200` rotas deste motorista · `404`                                |

### Rotas (escrita: OPERATOR/ADMIN · leitura: também DRIVER)

| Método | URL                      | Corpo                                                   | Respostas                                                                               |
| ------ | ------------------------ | ------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| POST   | `/routes`                | `{ name, shift, schoolName, vehicleId?, driverId? }`    | `201` · `400` · `404` veículo/motorista inexistente · `409`                             |
| GET    | `/routes`                | query `page`, `limit`, `status?`, `shift?`              | `200`                                                                                   |
| GET    | `/routes/:id`            | –                                                       | `200` · `404`                                                                           |
| PATCH  | `/routes/:id`            | `{ name?, shift?, schoolName?, vehicleId?, driverId? }` | `200` · `400` · `404` · `409`                                                           |
| POST   | `/routes/:id/activate`   | –                                                       | `200` · `404` · `409` sem veículo/motorista/ponto, motorista com CNH vencida ou inativo |
| POST   | `/routes/:id/deactivate` | –                                                       | `200` · `404` · `409` viagem em andamento                                               |
| GET    | `/routes/:id/students`   | –                                                       | `200` alunos alocados nesta rota · `404`                                                |

### Paradas (escrita: OPERATOR/ADMIN · leitura: também DRIVER)

| Método | URL                         | Corpo                                                                                                 | Respostas                                                                                           |
| ------ | --------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| POST   | `/routes/:id/stops`         | `{ position, cep, number, complement?, name? }` (endereço resolvido pela BrasilAPI a partir do `cep`) | `201` · `400` CEP inválido/posição duplicada · `404` rota · `409` · `502`/`504` falha na API de CEP |
| GET    | `/routes/:id/stops`         | –                                                                                                     | `200` pontos da rota, em ordem · `404`                                                              |
| DELETE | `/routes/:id/stops/:stopId` | –                                                                                                     | `204` · `404`                                                                                       |

### Alunos

| Método | URL                       | Papel           | Corpo                                                         | Respostas                                     |
| ------ | ------------------------- | --------------- | ------------------------------------------------------------- | --------------------------------------------- |
| POST   | `/students`               | OPERATOR, ADMIN | `{ name, birthDate, registrationNumber, schoolName, grade? }` | `201` · `400` · `409` matrícula já existe     |
| GET    | `/students`               | OPERATOR, ADMIN | query `page`, `limit`                                         | `200`                                         |
| GET    | `/students/:id`           | todos¹          | –                                                             | `200` · `403` sem vínculo/rota · `404`        |
| PATCH  | `/students/:id`           | OPERATOR, ADMIN | `{ name?, grade?, schoolName? }`                              | `200` · `400` · `404`                         |
| PATCH  | `/students/:id/route`     | OPERATOR, ADMIN | `{ routeId, stopId }` (ou `null` para remover da rota)        | `200` · `400` · `404` · `409` **rota lotada** |
| GET    | `/students/:id/guardians` | OPERATOR, ADMIN | –                                                             | `200` vínculos deste aluno · `404`            |
| GET    | `/students/:id/boardings` | todos¹          | query `page`, `limit`                                         | `200` histórico de embarques · `403` · `404`  |

¹ GUARDIAN só se tiver vínculo `ACTIVE`; DRIVER só se o aluno estiver
alocado na rota que ele conduz atualmente.

### Vínculos responsável-aluno

| Método | URL                                | Papel                            | Corpo                                                                      | Respostas                                                                                  |
| ------ | ---------------------------------- | -------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| POST   | `/guardian-relations`              | OPERATOR, ADMIN                  | `{ guardianId, studentId, relationship }`                                  | `201` · `400` · `404` responsável/aluno inexistente · `409` já existe vínculo não revogado |
| GET    | `/guardian-relations`              | GUARDIAN, OPERATOR, ADMIN        | query `page`, `limit`, `status?` (GUARDIAN só vê os próprios)              | `200`                                                                                      |
| GET    | `/guardian-relations/:id`          | GUARDIAN (dono), OPERATOR, ADMIN | –                                                                          | `200` · `403` · `404`                                                                      |
| POST   | `/guardian-relations/:id/document` | GUARDIAN (dono)                  | `multipart/form-data`, campo `file` (PDF/JPEG/PNG, até `UPLOAD_MAX_BYTES`) | `201` · `400` ausente/tipo inválido · `403` · `404` · `413` muito grande                   |
| GET    | `/guardian-relations/:id/document` | GUARDIAN (dono), OPERATOR, ADMIN | –                                                                          | `200` binário (`Content-Disposition: attachment`) · `403` · `404` sem documento enviado    |
| POST   | `/guardian-relations/:id/approve`  | OPERATOR, ADMIN                  | –                                                                          | `200` · `404` · `409` sem documento / já analisado                                         |
| POST   | `/guardian-relations/:id/reject`   | OPERATOR, ADMIN                  | `{ note? }`                                                                | `200` · `404` · `409`                                                                      |
| POST   | `/guardian-relations/:id/revoke`   | OPERATOR, ADMIN                  | –                                                                          | `200` · `404` · `409` já revogado                                                          |

### Viagens

| Método | URL                      | Papel                   | Corpo                                                                     | Respostas                                                                                                                              |
| ------ | ------------------------ | ----------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/routes/:routeId/trips` | DRIVER (da rota)        | –                                                                         | `201` viagem iniciada · `403` não é o motorista desta rota · `404` · `409` rota não `ACTIVE` / CNH vencida / já há viagem em andamento |
| GET    | `/trips`                 | OPERATOR, ADMIN, DRIVER | query `page`, `limit`, `status?`, `routeId?`, `from?`, `to?` (AAAA-MM-DD) | `200` · `400` `from` depois de `to`                                                                                                    |
| GET    | `/trips/:id`             | OPERATOR, ADMIN, DRIVER | –                                                                         | `200` · `403` · `404`                                                                                                                  |
| GET    | `/trips/:id/boardings`   | OPERATOR, ADMIN, DRIVER | –                                                                         | `200` lista de chamada da viagem · `404`                                                                                               |
| POST   | `/trips/:id/finish`      | DRIVER (da rota)        | –                                                                         | `200` · `403` · `404` · `409` já finalizada ou aluno(s) ainda a bordo                                                                  |

### Embarque e desembarque

| Método | URL                        | Papel            | Corpo           | Respostas                                                                                                                 |
| ------ | -------------------------- | ---------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/trips/:tripId/boardings` | DRIVER (da rota) | `{ studentId }` | `201` · `400` · `403` · `404` viagem/aluno · `409` viagem não em andamento / aluno inativo ou de outra rota / já embarcou |
| POST   | `/boardings/:id/alight`    | DRIVER (da rota) | –               | `200` · `403` · `404` · `409` registro não está `BOARDED`                                                                 |

---

## 10. Exemplos de requisição (fluxo completo por curl)

Substitua `$BASE` e `$API_KEY` pelos seus valores. Todo comando abaixo precisa
do cabeçalho `X-API-KEY`; os que agem em nome de um usuário também precisam do
`Authorization: Bearer <token>`.

```bash
BASE=http://localhost:3000
API_KEY=coloque-aqui-o-valor-do-seu-.env

# 1. Login do admin (criado pelo seed)
curl -s -X POST "$BASE/auth/login" \
  -H "X-API-KEY: $API_KEY" -H "Content-Type: application/json" \
  -d '{"email":"admin@transporte.local","password":"<a senha do seu .env>"}'
# => { "accessToken": "...", "tokenType": "Bearer" }
TOKEN_ADMIN="<cole o accessToken aqui>"

# 2. Cadastro público de um responsável
curl -s -X POST "$BASE/auth/register" \
  -H "X-API-KEY: $API_KEY" -H "Content-Type: application/json" \
  -d '{"name":"Maria Souza","email":"maria@exemplo.com","password":"senha-forte-123"}'

# 3. Admin cria um veículo
curl -s -X POST "$BASE/vehicles" \
  -H "X-API-KEY: $API_KEY" -H "Authorization: Bearer $TOKEN_ADMIN" -H "Content-Type: application/json" \
  -d '{"plate":"ABC1D23","model":"Sprinter","capacity":15}'

# 4. Admin cria uma conta de motorista, depois o perfil de motorista (CNH)
curl -s -X POST "$BASE/users" \
  -H "X-API-KEY: $API_KEY" -H "Authorization: Bearer $TOKEN_ADMIN" -H "Content-Type: application/json" \
  -d '{"name":"João Motorista","email":"joao@exemplo.com","password":"senha-forte-123","role":"DRIVER"}'
# => anote o "id" da resposta em $USER_ID
curl -s -X POST "$BASE/drivers" \
  -H "X-API-KEY: $API_KEY" -H "Authorization: Bearer $TOKEN_ADMIN" -H "Content-Type: application/json" \
  -d '{"userId":"$USER_ID","licenseNumber":"12345678900","licenseCategory":"D","licenseExpiresAt":"2030-01-01"}'

# 5. Cria a rota, associa veículo e motorista, adiciona um ponto (CEP real)
curl -s -X POST "$BASE/routes" \
  -H "X-API-KEY: $API_KEY" -H "Authorization: Bearer $TOKEN_ADMIN" -H "Content-Type: application/json" \
  -d '{"name":"Rota Centro","shift":"MORNING","schoolName":"Escola Municipal","vehicleId":"...","driverId":"..."}'
curl -s -X POST "$BASE/routes/$ROUTE_ID/stops" \
  -H "X-API-KEY: $API_KEY" -H "Authorization: Bearer $TOKEN_ADMIN" -H "Content-Type: application/json" \
  -d '{"position":1,"cep":"01310-100","number":"1000"}'
curl -s -X POST "$BASE/routes/$ROUTE_ID/activate" \
  -H "X-API-KEY: $API_KEY" -H "Authorization: Bearer $TOKEN_ADMIN"

# 6. Cadastra o aluno e aloca na rota
curl -s -X POST "$BASE/students" \
  -H "X-API-KEY: $API_KEY" -H "Authorization: Bearer $TOKEN_ADMIN" -H "Content-Type: application/json" \
  -d '{"name":"Ana Souza","birthDate":"2015-03-10","registrationNumber":"MAT-2026-001","schoolName":"Escola Municipal"}'
curl -s -X PATCH "$BASE/students/$STUDENT_ID/route" \
  -H "X-API-KEY: $API_KEY" -H "Authorization: Bearer $TOKEN_ADMIN" -H "Content-Type: application/json" \
  -d '{"routeId":"'"$ROUTE_ID"'","stopId":"'"$STOP_ID"'"}'

# 7. Cria o vínculo responsável-aluno e aprova (depois do upload — ver seção 11)
curl -s -X POST "$BASE/guardian-relations" \
  -H "X-API-KEY: $API_KEY" -H "Authorization: Bearer $TOKEN_ADMIN" -H "Content-Type: application/json" \
  -d '{"guardianId":"'"$GUARDIAN_USER_ID"'","studentId":"'"$STUDENT_ID"'","relationship":"MOTHER"}'

# 8. Motorista faz login, inicia a viagem, embarca e desembarca o aluno, finaliza
TOKEN_DRIVER="<login do motorista, como no passo 1>"
curl -s -X POST "$BASE/routes/$ROUTE_ID/trips" \
  -H "X-API-KEY: $API_KEY" -H "Authorization: Bearer $TOKEN_DRIVER"
curl -s -X POST "$BASE/trips/$TRIP_ID/boardings" \
  -H "X-API-KEY: $API_KEY" -H "Authorization: Bearer $TOKEN_DRIVER" -H "Content-Type: application/json" \
  -d '{"studentId":"'"$STUDENT_ID"'"}'
curl -s -X POST "$BASE/boardings/$BOARDING_ID/alight" \
  -H "X-API-KEY: $API_KEY" -H "Authorization: Bearer $TOKEN_DRIVER"
curl -s -X POST "$BASE/trips/$TRIP_ID/finish" \
  -H "X-API-KEY: $API_KEY" -H "Authorization: Bearer $TOKEN_DRIVER"
```

O mesmo fluxo pode ser testado pelo `/docs` (Swagger), rota por rota, sem
precisar montar nenhum `curl` manualmente.

---

## 11. Upload de documento

`POST /guardian-relations/:id/document`, só pelo responsável **dono** do
vínculo, corpo `multipart/form-data` com o campo `file`.

Validações, nessa ordem:

1. **Presença**: sem arquivo → `400`.
2. **Tamanho**: acima de `UPLOAD_MAX_BYTES` (padrão 5 MB) → `413`.
3. **Tipo**: o tipo real do arquivo é verificado pela **assinatura binária**
   (magic bytes, biblioteca `file-type`) — **não** pelo `Content-Type`
   enviado nem pela extensão do nome, que podem ser forjados. Só
   PDF/JPEG/PNG são aceitos; qualquer outro → `400`.

O arquivo aceito é salvo em `UPLOAD_DIR/<uuid>.<extensão>` (o nome original do
cliente nunca vira parte do caminho no disco) e o vínculo passa a ter
documento pendente de análise (`POST .../approve` ou `.../reject` por
OPERATOR/ADMIN). Reenviar um novo documento substitui o anterior.

```bash
curl -s -X POST "$BASE/guardian-relations/$RELATION_ID/document" \
  -H "X-API-KEY: $API_KEY" -H "Authorization: Bearer $TOKEN_GUARDIAN" \
  -F "file=@/caminho/para/documento.pdf"
```

---

## 12. Integração externa (CEP/geocodificação)

Ao cadastrar um ponto de parada (`POST /routes/:id/stops`), o `cep` informado
é resolvido pela [BrasilAPI](https://brasilapi.com.br) (`GET
{CEP_API_BASE_URL}/{cep}`), via `HttpService`, devolvendo endereço e (quando
disponíveis) latitude/longitude.

Tratamento de erro:

| Situação                                                | Resposta da API                                     |
| ------------------------------------------------------- | --------------------------------------------------- |
| CEP em formato inválido                                 | `400`, sem sequer chamar a BrasilAPI                |
| CEP não encontrado na BrasilAPI (404 upstream)          | `404`                                               |
| BrasilAPI não responde a tempo (`CEP_API_TIMEOUT_MS`)   | `504`                                               |
| BrasilAPI fora do ar / erro de rede / resposta inválida | `502`                                               |
| CEP válido mas sem coordenadas na resposta              | `201` normalmente, com `latitude`/`longitude` nulos |

A URL base e o timeout vêm do ambiente (`CEP_API_BASE_URL`,
`CEP_API_TIMEOUT_MS`), então é possível trocar de provedor compatível sem
alterar código.

---

## 13. Erros e códigos HTTP

Todo erro é devolvido no mesmo formato:

```json
{
  "statusCode": 409,
  "error": "Conflict",
  "message": "A rota já possui uma viagem em andamento."
}
```

Uso consistente em toda a API:

- **400** — corpo/parâmetros inválidos (campo ausente, tipo errado, UUID
  malformado, regra de formato do `class-validator`).
- **401** — sem `X-API-KEY`, `X-API-KEY` inválida, sem token, token
  inválido/expirado, ou credenciais de login erradas.
- **403** — autenticado, mas sem o papel exigido, ou tentando acessar um
  recurso de terceiro (ex.: aluno de outro motorista).
- **404** — recurso referenciado não existe (path param ou referência dentro
  do corpo, como um `vehicleId` inexistente).
- **409** — a operação conflita com o estado atual (regra de negócio):
  capacidade cheia, CNH vencida, viagem já finalizada, vínculo já revogado
  etc.
- **413** — upload maior que o limite configurado.
- **502/504** — falha/timeout na integração externa de CEP.

---

## 14. Decisões de projeto e limitações conhecidas

Registradas aqui por transparência, para quem for avaliar ou continuar o
projeto:

- **Sem prefixo `/api/v1`** e **sem refresh token**: simplificação
  consciente para o escopo desta entrega — mencionado como evolução natural.
- **403 (não 404) para recurso de terceiro**: decisão de projeto, centralizada
  em um único ponto por módulo (fácil de trocar se preferido).
- **`REVOKED` não é reversível no mesmo registro**: um vínculo revogado não
  "volta"; em vez disso, um vínculo novo é criado para o mesmo par
  responsável/aluno, e o antigo permanece na tabela como histórico (mantém
  rastreabilidade sem precisar de uma tabela de auditoria separada).
  Confirmado com o cliente do projeto.
- **Checagem "motorista conduz rota ativa" sem trava de linha**: ao desativar
  a conta de um motorista, a checagem de que ele não conduz uma rota ativa é
  feita sem `SELECT ... FOR UPDATE` (ao contrário da checagem de
  capacidade/embarque, que usa). Numa janela muito estreita, uma ativação de
  rota simultânea à desativação da conta poderia, em tese, cruzar. Evolução
  natural: um endpoint de "encerrar viagem em emergência" para a secretaria.
- **"Banco de dados indisponível" não foi testado automaticamente de ponta a
  ponta**: simular isso de verdade exigiria derrubar o PostgreSQL da máquina
  de desenvolvimento. O comportamento foi revisado no código (um erro de
  conexão do Prisma não é um `PrismaClientKnownRequestError`, então cai no
  tratamento padrão do Nest → `500` genérico, sem vazar detalhe — mesmo
  caminho já coberto por teste automatizado para outros erros inesperados),
  mas não há um teste automatizado específico derrubando o banco.
- **BrasilAPI é um serviço comunitário, sem SLA formal**: latência observada
  entre 140ms e ~2,3s em testes manuais. `CEP_API_TIMEOUT_MS` existe
  justamente para isso; trocar de provedor é só mudar `CEP_API_BASE_URL`
  (mesmo formato de resposta esperado).
- **Docker não foi incluído nesta entrega** — decisão do projeto, para
  focar o tempo disponível no domínio, segurança e testes primeiro.

---

## 15. Build de produção

```bash
npm run build      # gera dist/ (roda prisma generate antes, via prebuild)
npm run start:prod # node dist/main
```

Antes de rodar em produção de verdade:

- defina `NODE_ENV=production`;
- gere `JWT_SECRET`/`API_KEY` novos (nunca reaproveite os de desenvolvimento
  ou teste);
- rode as migrations com `npm run db:deploy` (`prisma migrate deploy` — não
  usa shadow database, seguro para produção);
- rode o seed uma única vez (`npm run db:seed`) para criar o admin inicial.

`npm run build` precisa terminar sem erros — é um dos critérios de entrega.

---

## 16. Solução de problemas comuns

| Sintoma                                                 | Causa provável                                                                                                                                                  | Solução                                                                                                            |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `Configuração de ambiente inválida: ...` ao subir a app | falta ou formato errado de alguma variável no `.env`                                                                                                            | leia a mensagem (cita o nome da variável) e confira a [seção 6](#6-variáveis-de-ambiente)                          |
| `npm run db:migrate` falha com erro de conexão          | Postgres não está rodando, ou `DATABASE_URL` errada                                                                                                             | confira `psql -U transporte_app -h localhost -d transporte_escolar`; confirme que o serviço do Postgres está ativo |
| Testes e2e falham todos com erro de conexão             | `.env.test` não configurado, ou `npm run db:migrate:test` não rodou                                                                                             | repita os passos 2.3 (arquivo `.env.test`) e 2.4                                                                   |
| `401` em toda requisição mesmo com token                | faltou o cabeçalho `X-API-KEY` (é exigido em **toda** rota, incluindo login)                                                                                    | adicione `-H "X-API-KEY: ..."`                                                                                     |
| `403` inesperado                                        | o papel do usuário logado não tem permissão para aquela rota, ou o recurso não pertence a ele — veja a [matriz de permissões](#8-perfis-e-matriz-de-permissões) | confirme o papel do usuário e a relação (vínculo/rota) com o recurso                                               |
| Erro do Prisma tipo "Client não gerado"                 | pasta `src/generated/prisma` ausente (ela não é versionada)                                                                                                     | `npm run db:generate` (ou repita `npm install`, que já roda isso)                                                  |

---

## Licença

Projeto de avaliação técnica (AV-09). Uso interno.
