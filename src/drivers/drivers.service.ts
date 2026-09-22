import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { Role, RouteStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateDriverDto } from './dto/create-driver.dto.js';
import type { UpdateDriverDto } from './dto/update-driver.dto.js';
import { cnhVencida } from './license.js';

/** O motorista sempre vem com os dados básicos do usuário (nunca o hash da senha). */
const COM_USUARIO = {
  user: { select: { id: true, name: true, email: true } },
} as const;

@Injectable()
export class DriversService {
  constructor(private readonly prisma: PrismaService) {}

  async criar(dto: CreateDriverDto) {
    const usuario = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { role: true },
    });
    if (!usuario) throw new NotFoundException('Usuário não encontrado.');
    if (usuario.role !== Role.DRIVER) {
      throw new ConflictException(
        'O usuário informado não tem o papel DRIVER.',
      );
    }

    const perfil = await this.prisma.driver.findUnique({
      where: { userId: dto.userId },
      select: { id: true },
    });
    if (perfil) {
      throw new ConflictException(
        'Este usuário já possui perfil de motorista.',
      );
    }
    await this.exigirCnhLivre(dto.licenseNumber);

    return this.prisma.driver.create({
      data: {
        userId: dto.userId,
        licenseNumber: dto.licenseNumber,
        licenseExpiresAt: new Date(dto.licenseExpiresAt),
      },
      include: COM_USUARIO,
    });
  }

  async listar({ page, limit }: PaginationQueryDto) {
    const [data, total] = await this.prisma.$transaction([
      this.prisma.driver.findMany({
        include: COM_USUARIO,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.driver.count(),
    ]);
    return { data, total, page, limit };
  }

  async buscar(id: string) {
    const motorista = await this.prisma.driver.findUnique({
      where: { id },
      include: COM_USUARIO,
    });
    if (!motorista) throw new NotFoundException('Motorista não encontrado.');
    return motorista;
  }

  async atualizar(id: string, dto: UpdateDriverDto) {
    const motorista = await this.buscar(id);

    if (dto.licenseNumber && dto.licenseNumber !== motorista.licenseNumber) {
      await this.exigirCnhLivre(dto.licenseNumber);
    }

    // Uma rota ativa precisa de motorista ativo com CNH válida: não dá para tirar isso dele.
    const deixariaInapto =
      dto.active === false ||
      (dto.licenseExpiresAt !== undefined &&
        cnhVencida(new Date(dto.licenseExpiresAt)));
    if (deixariaInapto) {
      const rotaAtiva = await this.prisma.route.findFirst({
        where: { driverId: id, status: RouteStatus.ACTIVE },
        select: { name: true },
      });
      if (rotaAtiva) {
        throw new ConflictException(
          `O motorista conduz a rota ativa "${rotaAtiva.name}": desative a rota ou troque o motorista antes.`,
        );
      }
    }

    return this.prisma.driver.update({
      where: { id },
      data: {
        licenseNumber: dto.licenseNumber,
        licenseExpiresAt: dto.licenseExpiresAt
          ? new Date(dto.licenseExpiresAt)
          : undefined,
        active: dto.active,
      },
      include: COM_USUARIO,
    });
  }

  /** Consulta por relacionamento: as rotas conduzidas por este motorista. */
  async rotas(id: string) {
    await this.buscar(id);
    return this.prisma.route.findMany({
      where: { driverId: id },
      select: { id: true, name: true, shift: true, status: true },
      orderBy: { name: 'asc' },
    });
  }

  private async exigirCnhLivre(licenseNumber: string): Promise<void> {
    const existente = await this.prisma.driver.findUnique({
      where: { licenseNumber },
      select: { id: true },
    });
    if (existente) throw new ConflictException('CNH já cadastrada.');
  }
}
