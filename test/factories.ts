import type { INestApplication } from '@nestjs/common';
import { Role, Shift, type Prisma } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { criarUsuario } from './create-app.js';

/** Data daqui a um ano (CNH válida). */
export const daquiAUmAno = () => {
  const data = new Date();
  data.setUTCFullYear(data.getUTCFullYear() + 1);
  return data;
};

/** Data de ontem (CNH vencida). */
export const ontem = () => new Date(Date.now() - 24 * 60 * 60 * 1000);

/**
 * Fábricas de dados para os testes: criam registros direto no banco, já em estados válidos,
 * para cada teste montar só o cenário de que precisa.
 */
export function fabricas(app: INestApplication) {
  const prisma = app.get(PrismaService);
  let n = 0;
  const proximo = () => ++n;

  const veiculo = (dados: Partial<Prisma.VehicleUncheckedCreateInput> = {}) =>
    prisma.vehicle.create({
      data: {
        plate: `AAA${1000 + proximo()}`,
        model: 'Van Escolar',
        capacity: 10,
        ...dados,
      },
    });

  /** Motorista completo: usuário DRIVER + perfil com CNH válida. */
  const motorista = async (
    dados: Partial<Prisma.DriverUncheckedCreateInput> & { email?: string } = {},
  ) => {
    const i = proximo();
    const { email, ...perfil } = dados;
    const usuario = await criarUsuario(app, {
      role: Role.DRIVER,
      email: email ?? `motorista${i}@teste.com`,
      name: `Motorista ${i}`,
    });
    return prisma.driver.create({
      data: {
        userId: usuario.id,
        licenseNumber: `CNH${10000 + i}`,
        licenseExpiresAt: daquiAUmAno(),
        ...perfil,
      },
      include: { user: true },
    });
  };

  const rota = (dados: Partial<Prisma.RouteUncheckedCreateInput> = {}) =>
    prisma.route.create({
      data: { name: `Rota ${proximo()}`, shift: Shift.MORNING, ...dados },
    });

  const ponto = (
    routeId: string,
    dados: Partial<Prisma.RouteStopUncheckedCreateInput> = {},
  ) =>
    prisma.routeStop.create({
      data: {
        routeId,
        position: proximo(),
        cep: '01001000',
        street: 'Praça da Sé',
        number: '1',
        neighborhood: 'Sé',
        city: 'São Paulo',
        state: 'SP',
        latitude: -23.55,
        longitude: -46.63,
        ...dados,
      },
    });

  const aluno = (dados: Partial<Prisma.StudentUncheckedCreateInput> = {}) => {
    const i = proximo();
    return prisma.student.create({
      data: {
        name: `Aluno ${i}`,
        birthDate: new Date('2015-05-10'),
        registrationNumber: `MAT${1000 + i}`,
        schoolName: 'Escola Municipal',
        ...dados,
      },
    });
  };

  return { veiculo, motorista, rota, ponto, aluno };
}
