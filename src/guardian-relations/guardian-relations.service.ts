import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, mkdir, unlink, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fileTypeFromBuffer } from 'file-type';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import type { EnvironmentVariables } from '../config/env.validation.js';
import {
  GuardianRelationStatus,
  Prisma,
  Role,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateGuardianRelationDto } from './dto/create-guardian-relation.dto.js';
import type { ListGuardianRelationsQueryDto } from './dto/list-guardian-relations-query.dto.js';
import type { RejectGuardianRelationDto } from './dto/reject-guardian-relation.dto.js';

/** Arquivo recebido pelo multer (armazenamento em memória). */
export interface ArquivoEnviado {
  buffer: Buffer;
  originalname: string;
  size: number;
}

/** Tipos aceitos como documento, identificados pelo CONTEÚDO do arquivo (não pelo nome). */
const TIPOS_PERMITIDOS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

/** O que uma resposta de vínculo traz. Nunca inclui o caminho do arquivo no servidor. */
const VINCULO = {
  id: true,
  relationship: true,
  status: true,
  documentName: true,
  documentMime: true,
  documentSize: true,
  reviewedAt: true,
  rejectionReason: true,
  createdAt: true,
  updatedAt: true,
  guardian: { select: { id: true, name: true, email: true } },
  student: { select: { id: true, name: true, registrationNumber: true } },
  reviewedBy: { select: { id: true, name: true } },
} as const;

/** Nome do arquivo para exibição: sem pastas nem caracteres estranhos (nunca vira caminho). */
function nomeSeguro(original: string): string {
  const semPasta = original.split(/[\\/]/).pop() ?? '';
  const limpo = semPasta
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // tira os acentos separados pelo NFKD
    .replace(/[^\w. -]/g, '_')
    .replace(/_+/g, '_')
    .trim()
    .slice(-100);
  return limpo || 'documento';
}

@Injectable()
export class GuardianRelationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  // ---------------------------------------------------------------------------
  // Cadastro e consultas
  // ---------------------------------------------------------------------------

  async criar(dto: CreateGuardianRelationDto) {
    const responsavel = await this.prisma.user.findUnique({
      where: { id: dto.guardianId },
      select: { role: true, active: true },
    });
    if (!responsavel)
      throw new NotFoundException('Responsável não encontrado.');
    if (responsavel.role !== Role.GUARDIAN) {
      throw new ConflictException(
        'O usuário informado não é um responsável (GUARDIAN).',
      );
    }
    if (!responsavel.active) {
      throw new ConflictException('O responsável está inativo.');
    }

    const aluno = await this.prisma.student.findUnique({
      where: { id: dto.studentId },
      select: { id: true },
    });
    if (!aluno) throw new NotFoundException('Aluno não encontrado.');

    // Só bloqueia se houver um vínculo NÃO REVOGADO (pendente, ativo ou rejeitado) para o
    // mesmo par: depois de REVOKED, a secretaria pode reabrir com um vínculo novo (ex.: guarda
    // devolvida por decisão judicial). O índice único parcial na migration é o reforço contra
    // corrida (duas criações simultâneas para o mesmo par -> a segunda vira 409, ver o filtro
    // de erros do Prisma).
    const existente = await this.prisma.guardianRelation.findFirst({
      where: {
        guardianId: dto.guardianId,
        studentId: dto.studentId,
        status: { not: GuardianRelationStatus.REVOKED },
      },
      select: { id: true },
    });
    if (existente) {
      throw new ConflictException(
        'Este responsável já tem um vínculo (pendente, ativo ou rejeitado) com este aluno.',
      );
    }

    // Cria devolvendo só o id e busca o vínculo completo em seguida: criar já com os 3
    // relacionamentos no select faz o Prisma 7 mandar consultas simultâneas no mesmo cliente
    // da transação, e o driver pg avisa (deprecation) que isso deixará de funcionar no pg@9.
    const criado = await this.prisma.guardianRelation.create({
      data: {
        guardianId: dto.guardianId,
        studentId: dto.studentId,
        relationship: dto.relationship,
      },
      select: { id: true },
    });
    return this.prisma.guardianRelation.findUniqueOrThrow({
      where: { id: criado.id },
      select: VINCULO,
    });
  }

  /** O responsável vê só os SEUS vínculos; secretaria e admin veem todos. */
  async listar(
    { page, limit, status, studentId }: ListGuardianRelationsQueryDto,
    usuario: AuthenticatedUser,
  ) {
    const where: Prisma.GuardianRelationWhereInput = {
      status,
      studentId,
      guardianId: usuario.role === Role.GUARDIAN ? usuario.id : undefined,
    };
    // Sem $transaction, pelo mesmo motivo do `criar` (vários relacionamentos no select).
    const [data, total] = await Promise.all([
      this.prisma.guardianRelation.findMany({
        where,
        select: VINCULO,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.guardianRelation.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async buscar(id: string, usuario: AuthenticatedUser) {
    const vinculo = await this.prisma.guardianRelation.findUnique({
      where: { id },
      select: VINCULO,
    });
    if (!vinculo) throw new NotFoundException('Vínculo não encontrado.');
    this.exigirDono(vinculo.guardian.id, usuario);
    return vinculo;
  }

  // ---------------------------------------------------------------------------
  // Documento de autorização (upload e download)
  // ---------------------------------------------------------------------------

  /**
   * Recebe o documento do responsável dono do vínculo. Só é possível com o vínculo PENDENTE ou
   * REJEITADO (reenvio); enviar de novo depois de rejeitado volta o vínculo para PENDENTE.
   *
   * Validações: presença, tamanho (limite do multer, 413) e TIPO pelo conteúdo do arquivo
   * (PDF, JPEG ou PNG). O Content-Type e a extensão informados pelo cliente NÃO são confiados.
   * O arquivo é salvo com um nome gerado pelo servidor (UUID): o nome enviado nunca vira caminho.
   */
  async enviarDocumento(
    id: string,
    usuario: AuthenticatedUser,
    arquivo: ArquivoEnviado | undefined,
  ) {
    const vinculo = await this.prisma.guardianRelation.findUnique({
      where: { id },
      select: { guardianId: true, status: true, documentPath: true },
    });
    if (!vinculo) throw new NotFoundException('Vínculo não encontrado.');
    this.exigirDono(vinculo.guardianId, usuario);
    if (
      vinculo.status !== GuardianRelationStatus.PENDING &&
      vinculo.status !== GuardianRelationStatus.REJECTED
    ) {
      throw new ConflictException(
        `Não é possível enviar documento com o vínculo ${vinculo.status}.`,
      );
    }

    if (!arquivo) {
      throw new BadRequestException(
        'Envie o arquivo no campo "file" (multipart/form-data).',
      );
    }
    if (arquivo.size === 0)
      throw new BadRequestException('O arquivo está vazio.');
    const tipo = await fileTypeFromBuffer(arquivo.buffer);
    const extensao = tipo ? TIPOS_PERMITIDOS[tipo.mime] : undefined;
    if (!tipo || !extensao) {
      throw new BadRequestException(
        'Tipo de arquivo não permitido: envie um PDF, JPEG ou PNG.',
      );
    }

    const pasta = this.pastaDeUploads();
    const nomeArmazenado = `${randomUUID()}.${extensao}`;
    await mkdir(pasta, { recursive: true });
    // Flag "wx": nunca sobrescreve um arquivo existente.
    await writeFile(join(pasta, nomeArmazenado), arquivo.buffer, {
      flag: 'wx',
    });

    try {
      // Só grava se o vínculo AINDA estiver PENDENTE/REJEITADO (uma aprovação simultânea vence)
      // e se o documento vigente ainda for o que lemos acima: com dois envios simultâneos, um
      // vence e o outro recebe 409, então nenhum arquivo fica órfão no disco.
      const gravado = await this.prisma.guardianRelation.updateMany({
        where: {
          id,
          documentPath: vinculo.documentPath,
          status: {
            in: [
              GuardianRelationStatus.PENDING,
              GuardianRelationStatus.REJECTED,
            ],
          },
        },
        data: {
          documentName: nomeSeguro(arquivo.originalname),
          documentPath: nomeArmazenado,
          documentMime: tipo.mime,
          documentSize: arquivo.size,
          status: GuardianRelationStatus.PENDING,
          rejectionReason: null,
          reviewedById: null,
          reviewedAt: null,
        },
      });
      if (gravado.count === 0) {
        throw new ConflictException(
          'O vínculo mudou enquanto o documento era enviado. Consulte-o e envie novamente.',
        );
      }
    } catch (erro) {
      // Compensação: se o banco não gravou, o arquivo novo não fica órfão no disco.
      await unlink(join(pasta, nomeArmazenado)).catch(() => undefined);
      throw erro;
    }

    // O documento antigo (se havia) é substituído: apaga o arquivo anterior.
    if (vinculo.documentPath) {
      await unlink(join(pasta, basename(vinculo.documentPath))).catch(
        () => undefined,
      );
    }
    return this.buscar(id, usuario);
  }

  /** Download do documento: só o responsável dono do vínculo e a secretaria/admin. */
  async baixarDocumento(id: string, usuario: AuthenticatedUser) {
    const vinculo = await this.prisma.guardianRelation.findUnique({
      where: { id },
      select: {
        guardianId: true,
        documentName: true,
        documentPath: true,
        documentMime: true,
        documentSize: true,
      },
    });
    if (!vinculo) throw new NotFoundException('Vínculo não encontrado.');
    this.exigirDono(vinculo.guardianId, usuario);
    if (!vinculo.documentPath || !vinculo.documentMime) {
      throw new NotFoundException('Este vínculo ainda não tem documento.');
    }

    // basename: defesa extra; o valor gravado já é um nome gerado pelo servidor.
    const caminho = join(this.pastaDeUploads(), basename(vinculo.documentPath));
    try {
      await access(caminho);
    } catch {
      throw new NotFoundException('O arquivo do documento não foi encontrado.');
    }
    return new StreamableFile(createReadStream(caminho), {
      type: vinculo.documentMime,
      disposition: `attachment; filename="${vinculo.documentName ?? 'documento'}"`,
      length: vinculo.documentSize ?? undefined,
    });
  }

  // ---------------------------------------------------------------------------
  // Fluxo de estados: PENDING -> ACTIVE | REJECTED; ACTIVE -> REVOKED
  // (REJECTED volta a PENDING quando o responsável reenvia o documento)
  // ---------------------------------------------------------------------------

  async aprovar(id: string, usuario: AuthenticatedUser) {
    const vinculo = await this.obter(id);
    if (vinculo.status !== GuardianRelationStatus.PENDING) {
      throw new ConflictException(
        `Só é possível aprovar um vínculo pendente (situação atual: ${vinculo.status}).`,
      );
    }
    if (!vinculo.documentPath) {
      throw new ConflictException(
        'O responsável ainda não enviou o documento de autorização.',
      );
    }
    return this.mudarStatus(id, GuardianRelationStatus.PENDING, {
      status: GuardianRelationStatus.ACTIVE,
      reviewedById: usuario.id,
      reviewedAt: new Date(),
      rejectionReason: null,
    });
  }

  async rejeitar(
    id: string,
    dto: RejectGuardianRelationDto,
    usuario: AuthenticatedUser,
  ) {
    const vinculo = await this.obter(id);
    if (vinculo.status !== GuardianRelationStatus.PENDING) {
      throw new ConflictException(
        `Só é possível rejeitar um vínculo pendente (situação atual: ${vinculo.status}).`,
      );
    }
    return this.mudarStatus(id, GuardianRelationStatus.PENDING, {
      status: GuardianRelationStatus.REJECTED,
      reviewedById: usuario.id,
      reviewedAt: new Date(),
      rejectionReason: dto.reason,
    });
  }

  async revogar(id: string, usuario: AuthenticatedUser) {
    const vinculo = await this.obter(id);
    if (vinculo.status !== GuardianRelationStatus.ACTIVE) {
      throw new ConflictException(
        `Só é possível revogar um vínculo ativo (situação atual: ${vinculo.status}).`,
      );
    }
    return this.mudarStatus(id, GuardianRelationStatus.ACTIVE, {
      status: GuardianRelationStatus.REVOKED,
      reviewedById: usuario.id,
      reviewedAt: new Date(),
      rejectionReason: null,
    });
  }

  // ---------------------------------------------------------------------------

  private async obter(id: string) {
    const vinculo = await this.prisma.guardianRelation.findUnique({
      where: { id },
      select: { status: true, documentPath: true },
    });
    if (!vinculo) throw new NotFoundException('Vínculo não encontrado.');
    return vinculo;
  }

  /**
   * Muda a situação SÓ SE ela ainda for a esperada (comparar-e-trocar atômico). Duas ações
   * simultâneas sobre o mesmo vínculo (ex.: aprovar e rejeitar): uma vence, a outra recebe 409.
   */
  private async mudarStatus(
    id: string,
    esperado: GuardianRelationStatus,
    dados: Prisma.GuardianRelationUncheckedUpdateManyInput,
  ) {
    const resultado = await this.prisma.guardianRelation.updateMany({
      where: { id, status: esperado },
      data: dados,
    });
    if (resultado.count === 0) {
      throw new ConflictException(
        'O vínculo mudou de situação enquanto a operação era feita. Consulte-o novamente.',
      );
    }
    return this.prisma.guardianRelation.findUniqueOrThrow({
      where: { id },
      select: VINCULO,
    });
  }

  /** Responsável só acessa o PRÓPRIO vínculo (403 nos de terceiros); secretaria/admin, qualquer um. */
  private exigirDono(guardianId: string, usuario: AuthenticatedUser): void {
    if (usuario.role === Role.GUARDIAN && guardianId !== usuario.id) {
      throw new ForbiddenException(
        'Este vínculo pertence a outro responsável.',
      );
    }
  }

  private pastaDeUploads(): string {
    return resolve(this.config.getOrThrow('UPLOAD_DIR', { infer: true }));
  }
}
