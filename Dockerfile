# syntax=docker/dockerfile:1

# ---- Etapa 1: build ----
# Instala TODAS as dependências (incl. devDependencies: precisa do compilador do Nest,
# do TypeScript e do CLI do Prisma) e gera o client + o build de produção.
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Etapa 2: runtime ----
# Mesma imagem base, node_modules completo (não só produção): assim `prisma migrate
# deploy` e `npm run db:seed*` continuam disponíveis dentro do container em execução,
# sem precisar de uma segunda imagem só pra isso.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/dist ./dist
# prisma/seed.ts e prisma/seed-demo.ts rodam via `tsx` direto na fonte TS (não no
# dist/ compilado) e importam o client gerado por `prisma generate` a partir daqui.
COPY --from=build /app/src/generated ./src/generated

RUN mkdir -p storage/uploads && chown -R node:node /app
USER node

EXPOSE 3000
CMD ["node", "dist/main.js"]
