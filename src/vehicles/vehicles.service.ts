import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RouteStatus, VehicleStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { travarRotasDoVeiculo } from '../routes/route-lock.js';
import type { CreateVehicleDto } from './dto/create-vehicle.dto.js';
import type { ListVehiclesQueryDto } from './dto/list-vehicles-query.dto.js';
import type { UpdateVehicleDto } from './dto/update-vehicle.dto.js';

@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  async criar(dto: CreateVehicleDto) {
    const existente = await this.prisma.vehicle.findUnique({
      where: { plate: dto.plate },
      select: { id: true },
    });
    if (existente) throw new ConflictException('Placa já cadastrada.');

    return this.prisma.vehicle.create({ data: dto });
  }

  async listar({ page, limit, status }: ListVehiclesQueryDto) {
    const where = { status };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.vehicle.findMany({
        where,
        orderBy: { plate: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.vehicle.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async buscar(id: string) {
    const veiculo = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!veiculo) throw new NotFoundException('Veículo não encontrado.');
    return veiculo;
  }

  async atualizar(id: string, dto: UpdateVehicleDto) {
    await this.buscar(id);

    return this.prisma.$transaction(async (tx) => {
      // Trava as rotas do veículo: quem estiver alocando alunos nelas espera esta alteração
      // (e vice-versa), então a capacidade nunca fica menor que a lotação por uma corrida.
      await travarRotasDoVeiculo(tx, id);

      if (dto.capacity !== undefined) {
        const novaCapacidade = dto.capacity;
        const rotas = await tx.route.findMany({
          where: { vehicleId: id },
          select: {
            name: true,
            _count: { select: { students: { where: { active: true } } } },
          },
        });
        const lotada = rotas.find((r) => r._count.students > novaCapacidade);
        if (lotada) {
          throw new ConflictException(
            `A rota "${lotada.name}" já tem ${lotada._count.students} alunos: a capacidade não pode ficar menor que isso.`,
          );
        }
      }

      if (dto.status !== undefined && dto.status !== VehicleStatus.ACTIVE) {
        const rotaAtiva = await tx.route.findFirst({
          where: { vehicleId: id, status: RouteStatus.ACTIVE },
          select: { name: true },
        });
        if (rotaAtiva) {
          throw new ConflictException(
            `O veículo está na rota ativa "${rotaAtiva.name}": desative a rota antes de tirá-lo de operação.`,
          );
        }
      }

      return tx.vehicle.update({ where: { id }, data: dto });
    });
  }

  /** Consulta por relacionamento: as rotas que usam este veículo. */
  async rotas(id: string) {
    await this.buscar(id);
    return this.prisma.route.findMany({
      where: { vehicleId: id },
      select: { id: true, name: true, shift: true, status: true },
      orderBy: { name: 'asc' },
    });
  }
}
