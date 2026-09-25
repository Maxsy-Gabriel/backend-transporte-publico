import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { cnhVencida } from '../drivers/license.js';
import {
  Prisma,
  Role,
  RouteStatus,
  Shift,
  TripStatus,
  VehicleStatus,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateRouteDto } from './dto/create-route.dto.js';
import type { ListRoutesQueryDto } from './dto/list-routes-query.dto.js';
import type { UpdateRouteDto } from './dto/update-route.dto.js';
import { travarRota } from './route-lock.js';

/** O que toda resposta de rota traz: veículo, motorista (só nome) e contagens. */
const INCLUIR = {
  vehicle: {
    select: {
      id: true,
      plate: true,
      model: true,
      capacity: true,
      status: true,
    },
  },
  driver: {
    select: {
      id: true,
      active: true,
      licenseExpiresAt: true,
      user: { select: { id: true, name: true } },
    },
  },
  _count: { select: { stops: true, students: { where: { active: true } } } },
} as const;

/** Troca o `_count` do Prisma por nomes claros: pontos e alunos ativos (lotação). */
function formatar<T extends { _count: { stops: number; students: number } }>(
  rota: T,
) {
  const { _count, ...resto } = rota;
  return {
    ...resto,
    stopsCount: _count.stops,
    studentsCount: _count.students,
  };
}

@Injectable()
export class RoutesService {
  constructor(private readonly prisma: PrismaService) {}

  async criar(dto: CreateRouteDto) {
    await this.exigirNomeLivre(this.prisma, dto.name, dto.shift);
    // Rota nova ainda não tem alunos: a capacidade do veículo sempre comporta 0.
    if (dto.vehicleId) await this.validarVeiculo(this.prisma, dto.vehicleId, 0);
    if (dto.driverId) await this.validarMotorista(this.prisma, dto.driverId);

    const rota = await this.prisma.route.create({
      data: {
        name: dto.name,
        shift: dto.shift,
        vehicleId: dto.vehicleId,
        driverId: dto.driverId,
      },
      include: INCLUIR,
    });
    return formatar(rota);
  }

  /** Secretaria e admin veem todas; o motorista vê só as rotas que conduz. */
  async listar(
    { page, limit, status, shift }: ListRoutesQueryDto,
    usuario: AuthenticatedUser,
  ) {
    const where: Prisma.RouteWhereInput = {
      status,
      shift,
      driver: usuario.role === Role.DRIVER ? { userId: usuario.id } : undefined,
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.route.findMany({
        where,
        include: INCLUIR,
        orderBy: [{ name: 'asc' }, { shift: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.route.count({ where }),
    ]);
    return { data: data.map(formatar), total, page, limit };
  }

  async buscar(id: string, usuario: AuthenticatedUser) {
    const rota = await this.prisma.route.findUnique({
      where: { id },
      include: INCLUIR,
    });
    if (!rota) throw new NotFoundException('Rota não encontrada.');
    if (usuario.role === Role.DRIVER && rota.driver?.user.id !== usuario.id) {
      throw new ForbiddenException('Você não conduz esta rota.');
    }
    return formatar(rota);
  }

  /**
   * Garante que a rota existe (404) e que o usuário pode vê-la: staff sempre; motorista só se for
   * o motorista dela (403). Usado também pelas paradas e pela lista de alunos.
   */
  async exigirAcesso(id: string, usuario: AuthenticatedUser): Promise<void> {
    const rota = await this.prisma.route.findUnique({
      where: { id },
      select: { driver: { select: { userId: true } } },
    });
    if (!rota) throw new NotFoundException('Rota não encontrada.');
    if (usuario.role === Role.DRIVER && rota.driver?.userId !== usuario.id) {
      throw new ForbiddenException('Você não conduz esta rota.');
    }
  }

  async atualizar(id: string, dto: UpdateRouteDto) {
    return this.prisma.$transaction(async (tx) => {
      // Trava a rota: nenhuma alocação de aluno acontece no meio desta alteração.
      await travarRota(tx, id);
      const rota = await tx.route.findUnique({
        where: { id },
        include: {
          _count: { select: { students: { where: { active: true } } } },
        },
      });
      if (!rota) throw new NotFoundException('Rota não encontrada.');

      const name = dto.name ?? rota.name;
      const shift = dto.shift ?? rota.shift;
      if (name !== rota.name || shift !== rota.shift) {
        await this.exigirNomeLivre(tx, name, shift, id);
      }

      const vehicleId =
        dto.vehicleId === undefined ? rota.vehicleId : dto.vehicleId;
      const driverId =
        dto.driverId === undefined ? rota.driverId : dto.driverId;
      if (rota.status === RouteStatus.ACTIVE && (!vehicleId || !driverId)) {
        throw new ConflictException(
          'Uma rota ativa precisa de veículo e motorista: desative-a antes de retirá-los.',
        );
      }
      if (dto.vehicleId) {
        await this.validarVeiculo(tx, dto.vehicleId, rota._count.students);
      }
      if (dto.driverId) await this.validarMotorista(tx, dto.driverId);

      const atualizada = await tx.route.update({
        where: { id },
        data: {
          name: dto.name,
          shift: dto.shift,
          vehicleId: dto.vehicleId,
          driverId: dto.driverId,
        },
        include: INCLUIR,
      });
      return formatar(atualizada);
    });
  }

  /**
   * DRAFT ou INACTIVE -> ACTIVE. Só ativa com veículo ativo, motorista ativo com CNH válida e
   * pelo menos um ponto. Se faltar algo, a resposta (409) lista tudo o que falta.
   */
  async ativar(id: string) {
    return this.prisma.$transaction(async (tx) => {
      await travarRota(tx, id);
      const rota = await tx.route.findUnique({
        where: { id },
        include: {
          vehicle: true,
          driver: {
            include: { user: { select: { active: true, role: true } } },
          },
          _count: { select: { stops: true } },
        },
      });
      if (!rota) throw new NotFoundException('Rota não encontrada.');
      if (rota.status === RouteStatus.ACTIVE) {
        throw new ConflictException('A rota já está ativa.');
      }

      const faltas: string[] = [];
      if (!rota.vehicle) faltas.push('não tem veículo');
      else if (rota.vehicle.status !== VehicleStatus.ACTIVE) {
        faltas.push('o veículo não está ativo');
      }
      if (!rota.driver) faltas.push('não tem motorista');
      else if (!rota.driver.active || !rota.driver.user.active) {
        faltas.push('o motorista está inativo');
      } else if (rota.driver.user.role !== Role.DRIVER) {
        faltas.push('o usuário do motorista não tem o papel DRIVER');
      } else if (cnhVencida(rota.driver.licenseExpiresAt)) {
        faltas.push('a CNH do motorista está vencida');
      }
      if (rota._count.stops === 0) faltas.push('não tem nenhum ponto');
      if (faltas.length > 0) {
        throw new ConflictException(
          `Não é possível ativar a rota: ${faltas.join('; ')}.`,
        );
      }

      const ativa = await tx.route.update({
        where: { id },
        data: { status: RouteStatus.ACTIVE },
        include: INCLUIR,
      });
      return formatar(ativa);
    });
  }

  /** ACTIVE -> INACTIVE. Não é possível com uma viagem em andamento na rota. */
  async desativar(id: string) {
    return this.prisma.$transaction(async (tx) => {
      // A mesma trava do início de viagem: as duas operações não se cruzam.
      await travarRota(tx, id);
      const rota = await tx.route.findUnique({
        where: { id },
        select: { status: true },
      });
      if (!rota) throw new NotFoundException('Rota não encontrada.');
      if (rota.status !== RouteStatus.ACTIVE) {
        throw new ConflictException('A rota não está ativa.');
      }
      const emAndamento = await tx.trip.count({
        where: { routeId: id, status: TripStatus.IN_PROGRESS },
      });
      if (emAndamento > 0) {
        throw new ConflictException(
          'Há uma viagem em andamento nesta rota: finalize-a antes de desativar.',
        );
      }

      const inativa = await tx.route.update({
        where: { id },
        data: { status: RouteStatus.INACTIVE },
        include: INCLUIR,
      });
      return formatar(inativa);
    });
  }

  /**
   * Soft delete (DELETE /routes/:id): a rota vira INACTIVE, qualquer que seja o estado atual.
   * Idempotente (já INACTIVE não dá erro). DRAFT nunca teve viagem, então vai direto, sem
   * checagem; ACTIVE passa pela mesma regra de `desativar` (não pode ter viagem em andamento).
   */
  async excluir(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await travarRota(tx, id);
      const rota = await tx.route.findUnique({
        where: { id },
        select: { status: true },
      });
      if (!rota) throw new NotFoundException('Rota não encontrada.');
      if (rota.status === RouteStatus.INACTIVE) return;

      if (rota.status === RouteStatus.ACTIVE) {
        const emAndamento = await tx.trip.count({
          where: { routeId: id, status: TripStatus.IN_PROGRESS },
        });
        if (emAndamento > 0) {
          throw new ConflictException(
            'Há uma viagem em andamento nesta rota: finalize-a antes de excluir.',
          );
        }
      }

      await tx.route.update({
        where: { id },
        data: { status: RouteStatus.INACTIVE },
      });
    });
  }

  /** Consulta por relacionamento: os alunos ativos da rota, ordenados por ponto e nome. */
  async alunos(id: string, usuario: AuthenticatedUser) {
    await this.exigirAcesso(id, usuario);
    return this.prisma.student.findMany({
      where: { routeId: id, active: true },
      select: {
        id: true,
        name: true,
        registrationNumber: true,
        schoolName: true,
        stop: {
          select: {
            id: true,
            position: true,
            name: true,
            street: true,
            number: true,
            neighborhood: true,
            city: true,
          },
        },
      },
      orderBy: [{ stop: { position: 'asc' } }, { name: 'asc' }],
    });
  }

  /** "Minhas rotas" do motorista autenticado. */
  async listarDoMotorista(userId: string) {
    const rotas = await this.prisma.route.findMany({
      where: { driver: { userId } },
      include: INCLUIR,
      orderBy: [{ name: 'asc' }, { shift: 'asc' }],
    });
    return rotas.map(formatar);
  }

  // ---------------------------------------------------------------------------
  // Validações compartilhadas (recebem o cliente da transação, quando há uma).
  // ---------------------------------------------------------------------------

  private async exigirNomeLivre(
    db: Prisma.TransactionClient,
    name: string,
    shift: Shift,
    ignorarId?: string,
  ): Promise<void> {
    const existente = await db.route.findUnique({
      where: { name_shift: { name, shift } },
      select: { id: true },
    });
    if (existente && existente.id !== ignorarId) {
      throw new ConflictException(
        'Já existe uma rota com este nome neste turno.',
      );
    }
  }

  /** O veículo precisa existir, estar ativo e comportar os alunos que a rota já tem. */
  private async validarVeiculo(
    db: Prisma.TransactionClient,
    vehicleId: string,
    alunosNaRota: number,
  ): Promise<void> {
    const veiculo = await db.vehicle.findUnique({ where: { id: vehicleId } });
    if (!veiculo) throw new NotFoundException('Veículo não encontrado.');
    if (veiculo.status !== VehicleStatus.ACTIVE) {
      throw new ConflictException('O veículo não está ativo.');
    }
    if (veiculo.capacity < alunosNaRota) {
      throw new ConflictException(
        `O veículo comporta ${veiculo.capacity} alunos e a rota já tem ${alunosNaRota}.`,
      );
    }
  }

  /**
   * O motorista precisa existir, estar ativo (perfil e conta), ter o papel DRIVER e CNH válida.
   */
  private async validarMotorista(
    db: Prisma.TransactionClient,
    driverId: string,
  ): Promise<void> {
    const motorista = await db.driver.findUnique({
      where: { id: driverId },
      include: { user: { select: { active: true, role: true } } },
    });
    if (!motorista) throw new NotFoundException('Motorista não encontrado.');
    if (!motorista.active || !motorista.user.active) {
      throw new ConflictException('O motorista está inativo.');
    }
    if (motorista.user.role !== Role.DRIVER) {
      throw new ConflictException(
        'O usuário do motorista não tem o papel DRIVER.',
      );
    }
    if (cnhVencida(motorista.licenseExpiresAt)) {
      throw new ConflictException('A CNH do motorista está vencida.');
    }
  }
}
