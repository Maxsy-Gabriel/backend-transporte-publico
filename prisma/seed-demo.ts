/**
 * Seed de DEMONSTRAÇÃO — popula o banco de DEV com dados fartos e correlatos
 * (usuários de cada papel, veículos, motoristas, rotas, paradas, alunos, vínculos em
 * todos os estados, viagens com histórico) para testar o frontend visualmente.
 *
 * Só toca no banco de DEV (lê .env, nunca .env.test) e só mexe em registros marcados
 * com a tag "demo" (e-mail terminando em @demo.local, placa/CNH/matrícula começando
 * com "DEM", nome de rota começando com "Demo "). Pode ser rodado várias vezes: sempre
 * apaga a geração anterior da demo antes de criar uma nova (dados aleatórios a cada run).
 *
 * NÃO é o seed oficial do projeto (prisma/seed.ts, que só cria o ADMIN inicial e é
 * parte da entrega avaliada) — este é uma ferramenta de desenvolvimento à parte.
 *
 * Executar: npm run db:seed:demo
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import argon2 from 'argon2';
import {
  BoardingStatus,
  GuardianRelationStatus,
  PrismaClient,
  Relationship,
  Role,
  RouteStatus,
  Shift,
  TripStatus,
  VehicleStatus,
} from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const SENHA_DEMO = 'Demo@12345678';
const UPLOAD_DIR = resolve(process.env.UPLOAD_DIR ?? './storage/uploads');

function aleatorio<T>(lista: T[]): T {
  return lista[Math.floor(Math.random() * lista.length)];
}
function embaralhar<T>(lista: T[]): T[] {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}
function diasAPartirDeHoje(offsetDias: number, horas = 7, minutos = 30): Date {
  const data = new Date();
  data.setDate(data.getDate() + offsetDias);
  data.setHours(horas, minutos, 0, 0);
  return data;
}

// PNG 1x1 mínimo, válido por assinatura binária (mesmo usado nos testes manuais).
const PNG_MINIMO = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
  0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xff, 0xff, 0x3f,
  0x00, 0x05, 0xfe, 0x02, 0xfe, 0xdc, 0xcc, 0x59, 0xe7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
  0x44, 0xae, 0x42, 0x60, 0x82,
]);

/** Grava um documento de demonstração em disco, igual ao que o endpoint de upload faria. */
async function gravarDocumentoDemo(): Promise<{
  documentName: string;
  documentPath: string;
  documentMime: string;
  documentSize: number;
}> {
  await mkdir(UPLOAD_DIR, { recursive: true });
  const nomeArmazenado = `${randomUUID()}.png`;
  await writeFile(join(UPLOAD_DIR, nomeArmazenado), PNG_MINIMO);
  return {
    documentName: 'autorizacao-demo.png',
    documentPath: nomeArmazenado,
    documentMime: 'image/png',
    documentSize: PNG_MINIMO.length,
  };
}

// Endereço REAL, resolvido de verdade pela BrasilAPI para o CEP 01310-100 (Av. Paulista) numa
// consulta anterior — reaproveitado aqui para não bombardear a API externa dezenas de vezes só
// para popular dados de demonstração; troca-se apenas o número/nome de cada ponto.
const ENDERECO_BASE = {
  cep: '01310100',
  street: 'Avenida Paulista',
  neighborhood: 'Bela Vista',
  city: 'São Paulo',
  state: 'SP',
  latitude: -23.5475,
  longitude: -46.63611,
};

const NOMES = [
  'Ana Souza', 'Bruno Alves', 'Carla Mendes', 'Diego Ferreira', 'Elaine Costa',
  'Fábio Ramos', 'Gabriela Nunes', 'Henrique Dias', 'Isabela Rocha', 'João Pereira',
  'Karina Lopes', 'Lucas Martins', 'Mariana Silva', 'Nelson Barros', 'Olívia Teixeira',
  'Paulo Cardoso', 'Queila Fontes', 'Rafael Gomes', 'Sandra Vieira', 'Thiago Correia',
  'Ursula Pinto', 'Vinícius Araújo', 'Wanda Farias', 'Xavier Moura', 'Yasmin Duarte',
];
const NOMES_ALUNOS = [
  'Miguel', 'Alice', 'Arthur', 'Sofia', 'Bernardo', 'Helena', 'Davi', 'Laura',
  'Gael', 'Valentina', 'Théo', 'Maria Luiza', 'Heitor', 'Isadora', 'Pedro',
];
const SOBRENOMES = ['Souza', 'Lima', 'Pereira', 'Costa', 'Ferreira', 'Rodrigues', 'Almeida'];
const ESCOLAS = ['Escola Municipal Jardim das Flores', 'Colégio Novo Horizonte', 'Escola Estadual Bela Vista'];

async function limparDadosDemoAnteriores(): Promise<void> {
  console.log('Limpando geração anterior da demo (se houver)...');

  const usuariosDemo = await prisma.user.findMany({
    where: { email: { endsWith: '@demo.local' } },
    select: { id: true },
  });
  const idsUsuariosDemo = usuariosDemo.map((u) => u.id);

  const rotasDemo = await prisma.route.findMany({
    where: { name: { startsWith: 'Demo ' } },
    select: { id: true },
  });
  const idsRotasDemo = rotasDemo.map((r) => r.id);

  const relacoesDemo = await prisma.guardianRelation.findMany({
    where: { guardianId: { in: idsUsuariosDemo } },
    select: { documentPath: true },
  });

  const viagensDemo = await prisma.trip.findMany({
    where: { routeId: { in: idsRotasDemo } },
    select: { id: true },
  });
  const idsViagensDemo = viagensDemo.map((t) => t.id);

  await prisma.boardingRecord.deleteMany({ where: { tripId: { in: idsViagensDemo } } });
  await prisma.trip.deleteMany({ where: { routeId: { in: idsRotasDemo } } });
  await prisma.guardianRelation.deleteMany({ where: { guardianId: { in: idsUsuariosDemo } } });
  await prisma.student.deleteMany({ where: { registrationNumber: { startsWith: 'DEM-' } } });
  await prisma.routeStop.deleteMany({ where: { routeId: { in: idsRotasDemo } } });
  await prisma.route.deleteMany({ where: { id: { in: idsRotasDemo } } });
  await prisma.driver.deleteMany({ where: { licenseNumber: { startsWith: 'DEM' } } });
  await prisma.vehicle.deleteMany({ where: { plate: { startsWith: 'DEM' } } });
  await prisma.user.deleteMany({ where: { id: { in: idsUsuariosDemo } } });

  for (const rel of relacoesDemo) {
    if (rel.documentPath) {
      await unlink(join(UPLOAD_DIR, basename(rel.documentPath))).catch(() => {});
    }
  }

  console.log(
    `Removidos: ${idsUsuariosDemo.length} usuários, ${idsRotasDemo.length} rotas (com paradas/alunos/vínculos/viagens/embarques em cascata).`,
  );
}

async function main(): Promise<void> {
  await limparDadosDemoAnteriores();

  const hash = await argon2.hash(SENHA_DEMO);
  const nomesEmbaralhados = embaralhar(NOMES);
  let cursorNome = 0;
  const proximoNome = () => nomesEmbaralhados[cursorNome++ % nomesEmbaralhados.length];

  console.log('\nCriando usuários...');

  // --- ADMIN extra (além do seed oficial) ---
  const admin = await prisma.user.create({
    data: {
      name: 'Admin Demo',
      email: 'admin.demo@demo.local',
      passwordHash: hash,
      role: Role.ADMIN,
    },
  });

  // --- OPERATOR ---
  const operadores = await Promise.all(
    [1, 2].map((n) =>
      prisma.user.create({
        data: {
          name: `${proximoNome()} (Operador ${n})`,
          email: `operador${n}.demo@demo.local`,
          passwordHash: hash,
          role: Role.OPERATOR,
        },
      }),
    ),
  );

  // --- DRIVER (contas) — a 6ª fica SEM perfil de motorista, de propósito ---
  const contasMotorista = await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      prisma.user.create({
        data: {
          name: proximoNome(),
          email: `motorista${i + 1}.demo@demo.local`,
          passwordHash: hash,
          role: Role.DRIVER,
        },
      }),
    ),
  );

  // --- GUARDIAN ---
  const responsaveis = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      prisma.user.create({
        data: {
          name: proximoNome(),
          email: `responsavel${i + 1}.demo@demo.local`,
          passwordHash: hash,
          role: Role.GUARDIAN,
        },
      }),
    ),
  );

  console.log(
    `Criados: 1 admin extra, ${operadores.length} operadores, ${contasMotorista.length} contas de motorista, ${responsaveis.length} responsáveis.`,
  );

  console.log('\nCriando veículos...');
  const statusVeiculos = [
    VehicleStatus.ACTIVE, VehicleStatus.ACTIVE, VehicleStatus.ACTIVE,
    VehicleStatus.ACTIVE, VehicleStatus.MAINTENANCE,
  ];
  const veiculos = await Promise.all(
    statusVeiculos.map((status, i) =>
      prisma.vehicle.create({
        data: {
          plate: `DEM${i + 1}A0${i + 1}`,
          model: aleatorio(['Sprinter', 'Van Escolar', 'Micro-ônibus', 'Kombi Adaptada']),
          capacity: aleatorio([12, 15, 20, 25]),
          status,
        },
      }),
    ),
  );

  console.log('\nCriando motoristas (perfil CNH)...');
  // 5 dos 6 motoristas ganham perfil; datas de CNH bem variadas (a última, JÁ VENCIDA, é de
  // propósito — serve para testar a regra "CNH vencida não pode conduzir" no frontend).
  const validadesCnh = [
    diasAPartirDeHoje(365 * 4), // ~4 anos no futuro
    diasAPartirDeHoje(365 * 2),
    diasAPartirDeHoje(180),
    diasAPartirDeHoje(30), // vence em breve
    diasAPartirDeHoje(-30), // JÁ VENCIDA (propositalmente)
  ];
  const motoristas = await Promise.all(
    contasMotorista.slice(0, 5).map((conta, i) =>
      prisma.driver.create({
        data: {
          userId: conta.id,
          licenseNumber: `DEM${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`,
          licenseExpiresAt: validadesCnh[i],
          active: true,
        },
      }),
    ),
  );
  console.log(
    `${motoristas.length} perfis de motorista criados (1 com CNH já vencida, de propósito). A 6ª conta DRIVER ficou sem perfil (para testar o estado "falta cadastrar CNH").`,
  );

  console.log('\nCriando rotas, paradas, alunos...');

  // Rota 1: ACTIVE, com histórico de viagens já finalizadas (dias anteriores).
  const rota1 = await prisma.route.create({
    data: {
      name: 'Demo Rota Centro',
      shift: Shift.MORNING,
      status: RouteStatus.ACTIVE,
      vehicleId: veiculos[0].id,
      driverId: motoristas[0].id,
    },
  });
  // Rota 2: ACTIVE, com uma viagem em andamento AGORA (para testar a tela do motorista ao vivo).
  const rota2 = await prisma.route.create({
    data: {
      name: 'Demo Rota Norte',
      shift: Shift.AFTERNOON,
      status: RouteStatus.ACTIVE,
      vehicleId: veiculos[1].id,
      driverId: motoristas[1].id,
    },
  });
  // Rota 3: ACTIVE, recém-ativada, ainda sem nenhuma viagem (estado "vazio").
  const rota3 = await prisma.route.create({
    data: {
      name: 'Demo Rota Sul',
      shift: Shift.MORNING,
      status: RouteStatus.ACTIVE,
      vehicleId: veiculos[2].id,
      driverId: motoristas[2].id,
    },
  });
  // Rota 4: INACTIVE (já rodou, foi desativada), mantém histórico.
  const rota4 = await prisma.route.create({
    data: {
      name: 'Demo Rota Leste',
      shift: Shift.EVENING,
      status: RouteStatus.INACTIVE,
      vehicleId: veiculos[3].id,
      driverId: motoristas[3].id,
    },
  });
  // Rota 5: DRAFT, com o motorista de CNH VENCIDA associado (não pode ser ativada — 409 esperado).
  const rota5 = await prisma.route.create({
    data: {
      name: 'Demo Rota Oeste (motorista com CNH vencida)',
      shift: Shift.AFTERNOON,
      status: RouteStatus.DRAFT,
      vehicleId: veiculos[4].id, // veículo em MAINTENANCE
      driverId: motoristas[4].id, // CNH vencida
    },
  });
  // Rota 6: DRAFT, completamente vazia (nem veículo nem motorista) — estado inicial "cru".
  const rota6 = await prisma.route.create({
    data: { name: 'Demo Rota Vazia', shift: Shift.EVENING, status: RouteStatus.DRAFT },
  });

  const rotasComPontos = [rota1, rota2, rota3, rota4];
  const pontosPorRota = new Map<string, { id: string }[]>();
  for (const rota of rotasComPontos) {
    const pontos = await Promise.all(
      [1, 2, 3].map((posicao) =>
        prisma.routeStop.create({
          data: {
            routeId: rota.id,
            position: posicao,
            name: aleatorio(['Em frente à padaria', 'Esquina da farmácia', 'Portão da praça', null]),
            ...ENDERECO_BASE,
            number: String(posicao * 100 + Math.floor(Math.random() * 90)),
          },
        }),
      ),
    );
    pontosPorRota.set(rota.id, pontos);
  }

  // 18 alunos: a maioria alocada numa das 4 rotas com pontos, alguns sem rota nenhuma.
  const alunos = [];
  for (let i = 0; i < 18; i++) {
    const rotaEscolhida = i < 14 ? aleatorio(rotasComPontos) : null;
    const pontosDaRota = rotaEscolhida ? pontosPorRota.get(rotaEscolhida.id)! : [];
    const aluno = await prisma.student.create({
      data: {
        name: `${aleatorio(NOMES_ALUNOS)} ${aleatorio(SOBRENOMES)}`,
        birthDate: new Date(2012 + Math.floor(Math.random() * 9), Math.floor(Math.random() * 12), 1 + Math.floor(Math.random() * 27)),
        registrationNumber: `DEM-2026-${String(i + 1).padStart(3, '0')}`,
        schoolName: aleatorio(ESCOLAS),
        routeId: rotaEscolhida?.id,
        stopId: rotaEscolhida ? aleatorio(pontosDaRota).id : undefined,
      },
    });
    alunos.push(aluno);
  }
  console.log(
    `${rotasComPontos.length + 2} rotas (4 com paradas), ${[...pontosPorRota.values()].flat().length} paradas, ${alunos.length} alunos (14 alocados, 4 sem rota).`,
  );

  console.log('\nCriando vínculos responsável-aluno (todos os estados)...');
  const alunosEmbaralhados = embaralhar(alunos);
  let cursorAluno = 0;
  const proximoAluno = () => alunosEmbaralhados[cursorAluno++ % alunosEmbaralhados.length];

  let totalVinculos = 0;
  for (const responsavel of responsaveis) {
    const situacao = aleatorio([
      'ACTIVE', 'ACTIVE', 'PENDING_SEM_DOC', 'PENDING_COM_DOC', 'REJECTED', 'REVOKED',
    ] as const);
    const aluno = proximoAluno();
    const relationship = aleatorio([Relationship.MOTHER, Relationship.FATHER, Relationship.LEGAL_GUARDIAN, Relationship.OTHER]);

    if (situacao === 'ACTIVE') {
      const doc = await gravarDocumentoDemo();
      await prisma.guardianRelation.create({
        data: {
          guardianId: responsavel.id,
          studentId: aluno.id,
          relationship,
          status: GuardianRelationStatus.ACTIVE,
          ...doc,
          reviewedById: admin.id,
          reviewedAt: diasAPartirDeHoje(-Math.floor(Math.random() * 20) - 1),
        },
      });
    } else if (situacao === 'PENDING_SEM_DOC') {
      await prisma.guardianRelation.create({
        data: { guardianId: responsavel.id, studentId: aluno.id, relationship, status: GuardianRelationStatus.PENDING },
      });
    } else if (situacao === 'PENDING_COM_DOC') {
      const doc = await gravarDocumentoDemo();
      await prisma.guardianRelation.create({
        data: {
          guardianId: responsavel.id, studentId: aluno.id, relationship,
          status: GuardianRelationStatus.PENDING, ...doc,
        },
      });
    } else if (situacao === 'REJECTED') {
      await prisma.guardianRelation.create({
        data: {
          guardianId: responsavel.id, studentId: aluno.id, relationship,
          status: GuardianRelationStatus.REJECTED,
          reviewedById: admin.id,
          reviewedAt: diasAPartirDeHoje(-Math.floor(Math.random() * 10) - 1),
          rejectionReason: aleatorio([
            'Foto cortada: envie o documento inteiro, com as quatro bordas visíveis.',
            'Documento ilegível, por favor reenvie com melhor iluminação.',
            'Documento não corresponde ao parentesco informado.',
          ]),
        },
      });
    } else {
      const doc = await gravarDocumentoDemo();
      await prisma.guardianRelation.create({
        data: {
          guardianId: responsavel.id, studentId: aluno.id, relationship,
          status: GuardianRelationStatus.REVOKED, ...doc,
          reviewedById: admin.id,
          reviewedAt: diasAPartirDeHoje(-Math.floor(Math.random() * 60) - 30),
        },
      });
    }
    totalVinculos++;
  }
  console.log(`${totalVinculos} vínculos criados (misturando ACTIVE, PENDING com/sem documento, REJECTED e REVOKED).`);

  console.log('\nCriando viagens e embarques (histórico)...');

  // Rota 1: 6 viagens FINALIZADAS nos últimos dias, cada uma com alguns alunos embarcados
  // e desembarcados (com carimbos de hora reais dentro da janela da viagem).
  const alunosRota1 = alunos.filter((a) => a.routeId === rota1.id);
  let totalViagens = 0;
  let totalEmbarques = 0;
  for (let diasAtras = 6; diasAtras >= 1; diasAtras--) {
    const inicio = diasAPartirDeHoje(-diasAtras, 7, 0);
    const fim = new Date(inicio.getTime() + 40 * 60_000);
    const viagem = await prisma.trip.create({
      data: { routeId: rota1.id, status: TripStatus.FINISHED, startedAt: inicio, finishedAt: fim },
    });
    totalViagens++;
    for (const aluno of embaralhar(alunosRota1).slice(0, 3)) {
      const embarque = new Date(inicio.getTime() + Math.random() * 15 * 60_000);
      const desembarque = new Date(embarque.getTime() + 10 * 60_000 + Math.random() * 10 * 60_000);
      await prisma.boardingRecord.create({
        data: {
          tripId: viagem.id, studentId: aluno.id, status: BoardingStatus.ALIGHTED,
          boardedAt: embarque, alightedAt: desembarque, registeredById: contasMotorista[0].id,
        },
      });
      totalEmbarques++;
    }
  }

  // Rota 4 (INACTIVE): também tem histórico de quando estava ativa.
  const alunosRota4 = alunos.filter((a) => a.routeId === rota4.id);
  for (let diasAtras = 10; diasAtras >= 8; diasAtras--) {
    const inicio = diasAPartirDeHoje(-diasAtras, 17, 30);
    const fim = new Date(inicio.getTime() + 35 * 60_000);
    const viagem = await prisma.trip.create({
      data: { routeId: rota4.id, status: TripStatus.FINISHED, startedAt: inicio, finishedAt: fim },
    });
    totalViagens++;
    for (const aluno of embaralhar(alunosRota4).slice(0, 2)) {
      const embarque = new Date(inicio.getTime() + Math.random() * 10 * 60_000);
      const desembarque = new Date(embarque.getTime() + 8 * 60_000);
      await prisma.boardingRecord.create({
        data: {
          tripId: viagem.id, studentId: aluno.id, status: BoardingStatus.ALIGHTED,
          boardedAt: embarque, alightedAt: desembarque, registeredById: contasMotorista[3].id,
        },
      });
      totalEmbarques++;
    }
  }

  // Rota 2: viagem EM ANDAMENTO agora mesmo — 1 aluno já embarcado, o resto ainda não.
  const alunosRota2 = alunos.filter((a) => a.routeId === rota2.id);
  const viagemEmAndamento = await prisma.trip.create({
    data: { routeId: rota2.id, status: TripStatus.IN_PROGRESS, startedAt: diasAPartirDeHoje(0, new Date().getHours(), new Date().getMinutes() - 12) },
  });
  totalViagens++;
  if (alunosRota2.length > 0) {
    await prisma.boardingRecord.create({
      data: {
        tripId: viagemEmAndamento.id, studentId: alunosRota2[0].id, status: BoardingStatus.BOARDED,
        boardedAt: diasAPartirDeHoje(0, new Date().getHours(), new Date().getMinutes() - 5),
        registeredById: contasMotorista[1].id,
      },
    });
    totalEmbarques++;
  }

  console.log(`${totalViagens} viagens criadas (${totalViagens - 1} finalizadas no passado, 1 em andamento agora), ${totalEmbarques} embarques/desembarques.`);

  console.log('\n=========================================================');
  console.log('CONTAS DE DEMONSTRAÇÃO (todas com a mesma senha, pra facilitar):');
  console.log(`  Senha (todas): ${SENHA_DEMO}`);
  console.log(`  ADMIN:      admin.demo@demo.local`);
  console.log(`  OPERATOR:   operador1.demo@demo.local, operador2.demo@demo.local`);
  console.log(`  DRIVER:     motorista1.demo@demo.local ... motorista6.demo@demo.local`);
  console.log(`              (motorista6 está sem perfil de CNH cadastrado ainda)`);
  console.log(`  GUARDIAN:   responsavel1.demo@demo.local ... responsavel8.demo@demo.local`);
  console.log('=========================================================');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
