/**
 * Seed: cria o administrador inicial. Sem ele ninguém poderia criar os demais usuários
 * (motoristas, operadores), pois só o ADMIN faz isso e o cadastro público cria apenas responsáveis.
 *
 * Executar: `npm run db:seed`. Lê do ambiente (.env):
 *   SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD (mínimo de 12 caracteres) e SEED_ADMIN_NAME (opcional).
 *
 * É idempotente: se o e-mail já existe, não faz nada e NUNCA sobrescreve a senha existente.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import argon2 from 'argon2';
import { PrismaClient, Role } from '../src/generated/prisma/client.js';

const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
const senha = process.env.SEED_ADMIN_PASSWORD;
const nome = process.env.SEED_ADMIN_NAME?.trim() || 'Administrador';

if (!email || !senha) {
  throw new Error(
    'Defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD para criar o administrador inicial.',
  );
}
if (senha.length < 12) {
  throw new Error('SEED_ADMIN_PASSWORD deve ter pelo menos 12 caracteres.');
}
// Em produção o valor de exemplo do .env.example não pode virar a senha do administrador.
if (process.env.NODE_ENV === 'production' && senha.includes('change-me')) {
  throw new Error(
    'SEED_ADMIN_PASSWORD é o valor de exemplo; defina uma senha real.',
  );
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

try {
  const existente = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existente) {
    console.log(`Administrador ${email} já existe: nada a fazer.`);
  } else {
    await prisma.user.create({
      data: {
        name: nome,
        email,
        passwordHash: await argon2.hash(senha),
        role: Role.ADMIN,
      },
    });
    console.log(`Administrador ${email} criado.`);
  }
} finally {
  await prisma.$disconnect();
}
