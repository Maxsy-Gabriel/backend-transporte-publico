import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import type { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import {
  BoardingStatus,
  GuardianRelationStatus,
  Prisma,
  Role,
  RouteStatus,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { travarRota } from '../routes/route-lock.js';
import type { AssignRouteDto } from './dto/assign-route.dto.js';
import type { CreateStudentDto } from './dto/create-student.dto.js';
import type { ListStudentsQueryDto } from './dto/list-students-query.dto.js';
import type { UpdateStudentDto } from './dto/update-student.dto.js';

/** Um item do histórico de embarques do aluno: o registro + em qual viagem/rota aconteceu. */
const HISTORICO_DO_ALUNO = {
  id: true,
  status: true,
  boardedAt: true,
  alightedAt: true,
  trip: {
    select: {
      id: true,
      status: true,
      startedAt: true,
      finishedAt: true,
      route: { select: { id: true, name: true, shift: true } },
    },
  },
} as const;

/** Dados que o motorista pode ver: sem a data de nascimento (ele não precisa dela). */
const ALUNO_BASICO = {
  id: true,
  name: true,
  registrationNumber: true,
  schoolName: true,
  active: true,
  route: { select: { id: true, name: true, shift: true } },
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
} as const;

/** Dados completos, para a secretaria/admin e para o responsável vinculado. */
const ALUNO_COMPLETO = {
  ...ALUNO_BASICO,
  birthDate: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class StudentsService {
  constructor(private readonly prisma: PrismaService) {}

  async criar(dto: CreateStudentDto) {
    this.exigirNascimentoNoPassado(dto.birthDate);
    await this.exigirMatriculaLivre(dto.registrationNumber);

    return this.prisma.student.create({
      data: {
        name: dto.name,
        birthDate: new Date(dto.birthDate),
        registrationNumber: dto.registrationNumber,
        schoolName: dto.schoolName,
      },
      select: ALUNO_COMPLETO,
    });
  }

  async listar({ page, limit, search, routeId }: ListStudentsQueryDto) {
    // No LIKE/ILIKE do Postgres, "%" e "_" são coringas. Escapados, a busca por "100%" procura
    // o texto literal, em vez de casar com qualquer coisa.
    const termo = search?.replace(/[\\%_]/g, '\\$&');
    const where: Prisma.StudentWhereInput = {
      routeId,
      OR: search
        ? [
            { name: { contains: termo, mode: 'insensitive' } },
            { registrationNumber: { contains: termo, mode: 'insensitive' } },
          ]
        : undefined,
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.student.findMany({
        where,
        select: ALUNO_COMPLETO,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.student.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  /**
   * Quem pode ver o aluno:
   *  - secretaria/admin: qualquer um;
   *  - responsável: só se o vínculo com o aluno estiver APROVADO (ACTIVE), senão 403;
   *  - motorista: só alunos da rota que ele conduz (sem a data de nascimento), senão 403.
   */
  async buscar(id: string, usuario: AuthenticatedUser) {
    const aluno = await this.prisma.student.findUnique({
      where: { id },
      select: ALUNO_COMPLETO,
    });
    if (!aluno) throw new NotFoundException('Aluno não encontrado.');
    await this.garantirAcesso(id, aluno.route?.id ?? null, usuario);

    if (usuario.role === Role.DRIVER) {
      const { birthDate: _naoExibir, ...basico } = aluno;
      return basico;
    }
    return aluno;
  }

  /**
   * Histórico de embarques/desembarques do aluno (em qualquer viagem, de qualquer data).
   * Mesma regra de acesso do `buscar`, sem a distinção de campos (aqui não há data de
   * nascimento para esconder).
   */
  async embarques(
    id: string,
    { page, limit }: PaginationQueryDto,
    usuario: AuthenticatedUser,
  ) {
    const aluno = await this.prisma.student.findUnique({
      where: { id },
      select: { routeId: true },
    });
    if (!aluno) throw new NotFoundException('Aluno não encontrado.');
    await this.garantirAcesso(id, aluno.routeId, usuario);

    const where = { studentId: id };
    const [data, total] = await Promise.all([
      this.prisma.boardingRecord.findMany({
        where,
        select: HISTORICO_DO_ALUNO,
        orderBy: [{ boardedAt: 'desc' as const }, { id: 'desc' as const }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.boardingRecord.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  /** 403 se o usuário não pode ver dados deste aluno (responsável sem vínculo ACTIVE, ou motorista de outra rota). Staff sempre pode. */
  private async garantirAcesso(
    alunoId: string,
    routeId: string | null,
    usuario: AuthenticatedUser,
  ): Promise<void> {
    if (usuario.role === Role.GUARDIAN) {
      const vinculo = await this.prisma.guardianRelation.count({
        where: {
          studentId: alunoId,
          guardianId: usuario.id,
          status: GuardianRelationStatus.ACTIVE,
        },
      });
      if (!vinculo) {
        throw new ForbiddenException(
          'Você não tem vínculo aprovado com este aluno.',
        );
      }
    } else if (usuario.role === Role.DRIVER) {
      const conduz = routeId
        ? await this.prisma.route.count({
            where: { id: routeId, driver: { userId: usuario.id } },
          })
        : 0;
      if (!conduz) {
        throw new ForbiddenException(
          'Este aluno não está em uma rota que você conduz.',
        );
      }
    }
  }

  async atualizar(id: string, dto: UpdateStudentDto) {
    const aluno = await this.prisma.student.findUnique({
      where: { id },
      select: { registrationNumber: true, active: true },
    });
    if (!aluno) throw new NotFoundException('Aluno não encontrado.');

    if (dto.birthDate) this.exigirNascimentoNoPassado(dto.birthDate);
    if (
      dto.registrationNumber &&
      dto.registrationNumber !== aluno.registrationNumber
    ) {
      await this.exigirMatriculaLivre(dto.registrationNumber);
    }

    // Aluno inativo não ocupa vaga: ao desativar, sai da rota (e não pode estar a bordo).
    const desativando = dto.active === false && aluno.active;
    if (desativando && (await this.estaABordo(this.prisma, id))) {
      throw new ConflictException(
        'O aluno está a bordo de uma viagem em andamento.',
      );
    }

    return this.prisma.student.update({
      where: { id },
      data: {
        name: dto.name,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
        registrationNumber: dto.registrationNumber,
        schoolName: dto.schoolName,
        active: dto.active,
        ...(desativando ? { routeId: null, stopId: null } : {}),
      },
      select: ALUNO_COMPLETO,
    });
  }

  /**
   * Coloca o aluno numa rota (ou o retira dela). REGRA DE CAPACIDADE: a rota nunca tem mais
   * alunos ativos do que os lugares do veículo.
   *
   * A conferência e a gravação acontecem numa transação com a rota TRAVADA: duas alocações
   * simultâneas para a última vaga não passam juntas, a segunda espera e recebe 409.
   */
  async alocar(id: string, dto: AssignRouteDto) {
    if (dto.routeId === null) return this.desalocar(id);
    const routeId = dto.routeId;
    const stopId = dto.stopId as string; // garantido pelo DTO quando há routeId

    return this.prisma.$transaction(async (tx) => {
      await travarRota(tx, routeId);

      const rota = await tx.route.findUnique({
        where: { id: routeId },
        include: { vehicle: true },
      });
      if (!rota) throw new NotFoundException('Rota não encontrada.');
      const aluno = await tx.student.findUnique({ where: { id } });
      if (!aluno) throw new NotFoundException('Aluno não encontrado.');

      if (!aluno.active) {
        throw new ConflictException(
          'Aluno inativo não pode ser colocado em rota.',
        );
      }
      if (rota.status === RouteStatus.INACTIVE) {
        throw new ConflictException('A rota está inativa.');
      }
      if (!rota.vehicle) {
        throw new ConflictException(
          'A rota não tem veículo: a capacidade é desconhecida.',
        );
      }

      const ponto = await tx.routeStop.findUnique({
        where: { id: stopId },
        select: { routeId: true },
      });
      if (!ponto) throw new NotFoundException('Ponto não encontrado.');
      if (ponto.routeId !== routeId) {
        throw new ConflictException('O ponto não pertence à rota informada.');
      }
      if (await this.estaABordo(tx, id)) {
        throw new ConflictException(
          'O aluno está a bordo de uma viagem em andamento.',
        );
      }

      // Lotação atual SEM contar este aluno: se ele só troca de ponto na mesma rota, não
      // ocupa uma vaga nova.
      const lotacao = await tx.student.count({
        where: { routeId, active: true, id: { not: id } },
      });
      if (lotacao >= rota.vehicle.capacity) {
        throw new ConflictException(
          `Rota lotada: o veículo comporta ${rota.vehicle.capacity} alunos.`,
        );
      }

      return tx.student.update({
        where: { id },
        data: { routeId, stopId },
        select: ALUNO_COMPLETO,
      });
    });
  }

  /** Consulta por relacionamento: os responsáveis de um aluno e a situação de cada vínculo. */
  async responsaveis(id: string) {
    const aluno = await this.prisma.student.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!aluno) throw new NotFoundException('Aluno não encontrado.');

    return this.prisma.guardianRelation.findMany({
      where: { studentId: id },
      select: {
        id: true,
        relationship: true,
        status: true,
        createdAt: true,
        guardian: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** "Meus alunos": os alunos com vínculo APROVADO com o responsável autenticado. */
  listarDoResponsavel(guardianId: string) {
    return this.prisma.student.findMany({
      where: {
        guardianRelations: {
          some: { guardianId, status: GuardianRelationStatus.ACTIVE },
        },
      },
      select: ALUNO_COMPLETO,
      orderBy: { name: 'asc' },
    });
  }

  private async desalocar(id: string) {
    const aluno = await this.prisma.student.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!aluno) throw new NotFoundException('Aluno não encontrado.');
    if (await this.estaABordo(this.prisma, id)) {
      throw new ConflictException(
        'O aluno está a bordo de uma viagem em andamento.',
      );
    }
    return this.prisma.student.update({
      where: { id },
      data: { routeId: null, stopId: null },
      select: ALUNO_COMPLETO,
    });
  }

  private async estaABordo(
    db: Prisma.TransactionClient,
    studentId: string,
  ): Promise<boolean> {
    const total = await db.boardingRecord.count({
      where: { studentId, status: BoardingStatus.BOARDED },
    });
    return total > 0;
  }

  private async exigirMatriculaLivre(registrationNumber: string) {
    const existente = await this.prisma.student.findUnique({
      where: { registrationNumber },
      select: { id: true },
    });
    if (existente) throw new ConflictException('Matrícula já cadastrada.');
  }

  private exigirNascimentoNoPassado(birthDate: string): void {
    if (new Date(birthDate) > new Date()) {
      throw new BadRequestException('birthDate não pode estar no futuro.');
    }
  }
}
