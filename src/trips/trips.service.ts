import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { cnhVencida } from '../drivers/license.js';
import {
  BoardingStatus,
  Role,
  RouteStatus,
  TripStatus,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { travarRota } from '../routes/route-lock.js';
import type { BoardStudentDto } from './dto/board-student.dto.js';
import type { ListTripsQueryDto } from './dto/list-trips-query.dto.js';
import { travarViagem } from './trip-lock.js';

/** O que toda resposta de viagem traz: a rota (resumida) e as duas marcações de tempo. */
const INCLUIR = {
  route: { select: { id: true, name: true, shift: true } },
} as const;

/** O que toda resposta de embarque/desembarque traz: o aluno (resumido). */
const INCLUIR_EMBARQUE = {
  student: { select: { id: true, name: true, registrationNumber: true } },
} as const;

@Injectable()
export class TripsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Inicia uma viagem da rota. Só o motorista DA ROTA pode iniciar, e só uma rota ATIVA, com
   * CNH ainda válida (ela pode ter vencido depois da rota ser ativada). A rota é travada
   * (mesma trava usada para a capacidade) para que duas tentativas de início não passem juntas;
   * o banco também tem um índice único parcial de reforço (1 viagem em andamento por rota).
   */
  async iniciar(routeId: string, usuario: AuthenticatedUser) {
    return this.prisma.$transaction(async (tx) => {
      await travarRota(tx, routeId);
      const rota = await tx.route.findUnique({
        where: { id: routeId },
        include: { driver: { include: { user: true } } },
      });
      if (!rota) throw new NotFoundException('Rota não encontrada.');
      if (rota.driver?.user.id !== usuario.id) {
        throw new ForbiddenException('Você não conduz esta rota.');
      }
      if (rota.status !== RouteStatus.ACTIVE) {
        throw new ConflictException('A rota não está ativa.');
      }
      // Rota ativa sempre tem motorista (regra de ativação), mas a CNH pode ter vencido depois.
      if (cnhVencida(rota.driver.licenseExpiresAt)) {
        throw new ConflictException('Sua CNH está vencida.');
      }

      const emAndamento = await tx.trip.findFirst({
        where: { routeId, status: TripStatus.IN_PROGRESS },
        select: { id: true },
      });
      if (emAndamento) {
        throw new ConflictException(
          'Já existe uma viagem em andamento nesta rota.',
        );
      }

      return tx.trip.create({ data: { routeId }, include: INCLUIR });
    });
  }

  /**
   * Finaliza a viagem. Só o motorista da rota, só uma viagem em andamento, e só sem ninguém
   * a bordo (o desembarque de todos precede a finalização). Trava a viagem: embarcar e
   * finalizar não podem passar juntos (ver `travarViagem`).
   */
  async finalizar(id: string, usuario: AuthenticatedUser) {
    return this.prisma.$transaction(async (tx) => {
      await travarViagem(tx, id);
      const viagem = await tx.trip.findUnique({
        where: { id },
        include: {
          route: { include: { driver: { include: { user: true } } } },
        },
      });
      if (!viagem) throw new NotFoundException('Viagem não encontrada.');
      if (viagem.route.driver?.user.id !== usuario.id) {
        throw new ForbiddenException('Você não conduz esta rota.');
      }
      if (viagem.status !== TripStatus.IN_PROGRESS) {
        throw new ConflictException('Esta viagem já foi finalizada.');
      }

      const aBordo = await tx.boardingRecord.count({
        where: { tripId: id, status: BoardingStatus.BOARDED },
      });
      if (aBordo > 0) {
        throw new ConflictException(
          `Há ${aBordo} aluno(s) a bordo: desembarque-os antes de finalizar a viagem.`,
        );
      }

      return tx.trip.update({
        where: { id },
        data: { status: TripStatus.FINISHED, finishedAt: new Date() },
        include: INCLUIR,
      });
    });
  }

  /**
   * Embarca um aluno na viagem. Só o motorista da rota, só com a viagem em andamento, só um
   * aluno ativo que pertence a ESTA rota, e só uma vez por viagem (reembarcar depois de
   * desembarcado na mesma viagem não é permitido — índice único `tripId+studentId`).
   */
  async embarcar(
    tripId: string,
    dto: BoardStudentDto,
    usuario: AuthenticatedUser,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await travarViagem(tx, tripId);
      const viagem = await tx.trip.findUnique({
        where: { id: tripId },
        include: {
          route: { include: { driver: { include: { user: true } } } },
        },
      });
      if (!viagem) throw new NotFoundException('Viagem não encontrada.');
      if (viagem.route.driver?.user.id !== usuario.id) {
        throw new ForbiddenException('Você não conduz esta rota.');
      }
      if (viagem.status !== TripStatus.IN_PROGRESS) {
        throw new ConflictException('A viagem não está em andamento.');
      }

      const aluno = await tx.student.findUnique({
        where: { id: dto.studentId },
      });
      if (!aluno) throw new NotFoundException('Aluno não encontrado.');
      if (!aluno.active) {
        throw new ConflictException('Aluno inativo não pode embarcar.');
      }
      if (aluno.routeId !== viagem.routeId) {
        throw new ConflictException('Este aluno não pertence a esta rota.');
      }

      const jaTem = await tx.boardingRecord.findUnique({
        where: { tripId_studentId: { tripId, studentId: dto.studentId } },
        select: { id: true },
      });
      if (jaTem) {
        throw new ConflictException('Este aluno já embarcou nesta viagem.');
      }

      // Não checamos aqui "o aluno já está a bordo de OUTRA viagem": como cada aluno pertence
      // a no máximo uma rota e cada rota tem no máximo uma viagem em andamento, isso nunca
      // acontece na prática. O índice único parcial no banco (`boarding_records_open_per_
      // student_key`) é a rede de segurança, caso essas regras mudem no futuro.
      return tx.boardingRecord.create({
        data: {
          tripId,
          studentId: dto.studentId,
          registeredById: usuario.id,
        },
        include: INCLUIR_EMBARQUE,
      });
    });
  }

  /**
   * Desembarca um aluno. Só o motorista da rota, só um registro ainda BOARDED. Como só temos o
   * id do registro (não o da viagem), lemos o `tripId` primeiro, travamos a viagem, e só então
   * conferimos tudo de novo — assim nada muda embaixo do nosso pé entre ler e travar.
   */
  async desembarcar(id: string, usuario: AuthenticatedUser) {
    return this.prisma.$transaction(async (tx) => {
      const referencia = await tx.boardingRecord.findUnique({
        where: { id },
        select: { tripId: true },
      });
      if (!referencia) {
        throw new NotFoundException('Registro de embarque não encontrado.');
      }
      await travarViagem(tx, referencia.tripId);

      const registro = await tx.boardingRecord.findUniqueOrThrow({
        where: { id },
        include: {
          trip: {
            include: {
              route: { include: { driver: { include: { user: true } } } },
            },
          },
        },
      });
      if (registro.trip.route.driver?.user.id !== usuario.id) {
        throw new ForbiddenException('Você não conduz esta rota.');
      }
      if (registro.status !== BoardingStatus.BOARDED) {
        throw new ConflictException('Este aluno já desembarcou.');
      }

      return tx.boardingRecord.update({
        where: { id },
        data: { status: BoardingStatus.ALIGHTED, alightedAt: new Date() },
        include: INCLUIR_EMBARQUE,
      });
    });
  }

  /**
   * Secretaria e admin veem todas as viagens; o motorista só as da própria rota.
   * `from`/`to` filtram por `startedAt`, como um dia de calendário em UTC (mesma simplificação
   * já usada para `birthDate`/`licenseExpiresAt`): "to" inclui o dia inteiro, até 23:59:59.999.
   */
  async listar(
    { page, limit, status, routeId, from, to }: ListTripsQueryDto,
    usuario: AuthenticatedUser,
  ) {
    if (from && to && from > to) {
      throw new BadRequestException('from não pode ser depois de to.');
    }
    const where = {
      status,
      routeId,
      route:
        usuario.role === Role.DRIVER
          ? { driver: { userId: usuario.id } }
          : undefined,
      startedAt:
        from || to
          ? {
              gte: from ? new Date(`${from}T00:00:00.000Z`) : undefined,
              lte: to ? new Date(`${to}T23:59:59.999Z`) : undefined,
            }
          : undefined,
    };
    const [data, total] = await Promise.all([
      this.prisma.trip.findMany({
        where,
        include: INCLUIR,
        orderBy: [{ startedAt: 'desc' as const }, { id: 'desc' as const }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.trip.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async buscar(id: string, usuario: AuthenticatedUser) {
    const viagem = await this.prisma.trip.findUnique({
      where: { id },
      include: { route: { include: { driver: true } } },
    });
    if (!viagem) throw new NotFoundException('Viagem não encontrada.');
    if (
      usuario.role === Role.DRIVER &&
      viagem.route.driver?.userId !== usuario.id
    ) {
      throw new ForbiddenException('Você não conduz esta rota.');
    }
    const { route: rota, ...resto } = viagem;
    return {
      ...resto,
      route: { id: rota.id, name: rota.name, shift: rota.shift },
    };
  }

  /**
   * Quem embarcou/desembarcou nesta viagem (a "lista de chamada" dela). Mesma regra de acesso
   * da `buscar`; sem paginação porque o total nunca passa da capacidade do veículo.
   */
  async embarques(id: string, usuario: AuthenticatedUser) {
    const viagem = await this.prisma.trip.findUnique({
      where: { id },
      include: { route: { include: { driver: true } } },
    });
    if (!viagem) throw new NotFoundException('Viagem não encontrada.');
    if (
      usuario.role === Role.DRIVER &&
      viagem.route.driver?.userId !== usuario.id
    ) {
      throw new ForbiddenException('Você não conduz esta rota.');
    }

    return this.prisma.boardingRecord.findMany({
      where: { tripId: id },
      include: INCLUIR_EMBARQUE,
      orderBy: [{ boardedAt: 'asc' as const }, { id: 'asc' as const }],
    });
  }
}
