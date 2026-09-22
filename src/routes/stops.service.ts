import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { RouteStatus } from '../generated/prisma/client.js';
import { CepService } from '../geo/cep.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateStopDto } from './dto/create-stop.dto.js';
import { travarRota } from './route-lock.js';
import { RoutesService } from './routes.service.js';

@Injectable()
export class StopsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cep: CepService,
    private readonly routes: RoutesService,
  ) {}

  /**
   * Cria um ponto no fim da rota. O endereço e as coordenadas vêm da consulta de CEP (serviço
   * externo). Se o serviço falhar, nada é gravado e o erro é controlado (404, 502 ou 504).
   */
  async criar(routeId: string, dto: CreateStopDto) {
    const rota = await this.prisma.route.findUnique({
      where: { id: routeId },
      select: { id: true },
    });
    if (!rota) throw new NotFoundException('Rota não encontrada.');

    // A consulta externa fica FORA da transação: não se segura trava no banco esperando a rede.
    const endereco = await this.cep.consultar(dto.cep);
    const street = dto.street ?? endereco.street;
    const neighborhood = dto.neighborhood ?? endereco.neighborhood;
    if (!street || !neighborhood) {
      throw new BadRequestException(
        'Este CEP não informa logradouro ou bairro: envie "street" e "neighborhood".',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Trava a rota: dois pontos criados ao mesmo tempo recebem posições diferentes.
      await travarRota(tx, routeId);
      const { _max } = await tx.routeStop.aggregate({
        where: { routeId },
        _max: { position: true },
      });
      return tx.routeStop.create({
        data: {
          routeId,
          position: (_max.position ?? 0) + 1,
          name: dto.name,
          cep: endereco.cep,
          street,
          number: dto.number,
          complement: dto.complement,
          neighborhood,
          city: endereco.city,
          state: endereco.state,
          latitude: endereco.latitude,
          longitude: endereco.longitude,
        },
      });
    });
  }

  async listar(routeId: string, usuario: AuthenticatedUser) {
    await this.routes.exigirAcesso(routeId, usuario);
    return this.prisma.routeStop.findMany({
      where: { routeId },
      orderBy: { position: 'asc' },
    });
  }

  /**
   * Remove um ponto. Não pode ter alunos nele, e uma rota ativa não pode ficar sem pontos.
   * As posições dos demais pontos não mudam (podem ficar lacunas na numeração).
   */
  async remover(routeId: string, stopId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await travarRota(tx, routeId);
      const ponto = await tx.routeStop.findFirst({
        where: { id: stopId, routeId },
        include: { _count: { select: { students: true } } },
      });
      if (!ponto)
        throw new NotFoundException('Ponto não encontrado nesta rota.');
      if (ponto._count.students > 0) {
        throw new ConflictException(
          'Há alunos neste ponto: mude o ponto deles antes de removê-lo.',
        );
      }

      const rota = await tx.route.findUniqueOrThrow({
        where: { id: routeId },
        include: { _count: { select: { stops: true } } },
      });
      if (rota.status === RouteStatus.ACTIVE && rota._count.stops <= 1) {
        throw new ConflictException(
          'Uma rota ativa precisa de pelo menos um ponto.',
        );
      }
      await tx.routeStop.delete({ where: { id: stopId } });
    });
  }
}
