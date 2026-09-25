import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import {
  RespostaCorpoInvalido,
  RespostaConflito,
  RespostaNaoAutenticado,
  RespostaNaoEncontrado,
  RespostaSemPermissao,
} from '../common/swagger/respostas.js';
import { Role } from '../generated/prisma/client.js';
import { CreateGuardianRelationDto } from './dto/create-guardian-relation.dto.js';
import { ListGuardianRelationsQueryDto } from './dto/list-guardian-relations-query.dto.js';
import { RejectGuardianRelationDto } from './dto/reject-guardian-relation.dto.js';
import {
  GuardianRelationsService,
  type ArquivoEnviado,
} from './guardian-relations.service.js';

const ID_VINCULO = {
  name: 'id',
  description: 'Id do vínculo (UUID).',
  example: '018f2f9e-2a3b-7c11-9f21-2b6b7e0a1234',
};
const EXEMPLO_VINCULO = {
  id: '018f2f9e-2a3b-7c11-9f21-2b6b7e0a1234',
  relationship: 'MOTHER',
  status: 'PENDING',
  documentName: null,
  documentMime: null,
  documentSize: null,
  reviewedAt: null,
  rejectionReason: null,
  createdAt: '2026-09-21T12:00:00.000Z',
  updatedAt: '2026-09-21T12:00:00.000Z',
  guardian: {
    id: '018f...',
    name: 'Ana Souza',
    email: 'ana.souza@example.com',
  },
  student: {
    id: '018f...',
    name: 'Aluno Exemplo',
    registrationNumber: 'MAT-2026-001',
  },
  reviewedBy: null,
};

/**
 * Vínculos responsável-aluno. Criar, aprovar, rejeitar e revogar: secretaria/admin. Ver: o dono
 * do vínculo e a secretaria/admin. Enviar o documento: só o responsável dono (upload).
 */
@ApiTags('Vínculos responsável-aluno')
@RespostaNaoAutenticado()
@Controller('guardian-relations')
export class GuardianRelationsController {
  constructor(private readonly relations: GuardianRelationsService) {}

  @ApiOperation({
    summary: 'Cria um vínculo responsável-aluno',
    description:
      'Nasce PENDING, sem documento. Um par (responsável, aluno) só pode ter UM vínculo NÃO ' +
      'revogado por vez — depois de REVOKED, é possível cadastrar um vínculo novo para o mesmo par.',
  })
  @ApiResponse({
    status: 201,
    description: 'Vínculo criado.',
    schema: { example: EXEMPLO_VINCULO },
  })
  @RespostaCorpoInvalido()
  @RespostaNaoEncontrado('Responsável ou aluno não encontrado.')
  @RespostaConflito(
    'O usuário informado não é GUARDIAN, está inativo, OU já existe um vínculo não revogado para este par.',
  )
  @RespostaSemPermissao()
  @Roles(Role.OPERATOR, Role.ADMIN)
  @Post()
  criar(@Body() dto: CreateGuardianRelationDto) {
    return this.relations.criar(dto);
  }

  @ApiOperation({
    summary: 'Lista os vínculos',
    description:
      'Paginado. O responsável vê só os PRÓPRIOS; secretaria/admin veem todos.',
  })
  @ApiResponse({
    status: 200,
    description: 'Página de vínculos.',
    schema: {
      example: { data: [EXEMPLO_VINCULO], total: 1, page: 1, limit: 20 },
    },
  })
  @RespostaCorpoInvalido(
    'Página, limite, situação ou studentId fora do formato aceito.',
  )
  @RespostaSemPermissao()
  @Roles(Role.GUARDIAN, Role.OPERATOR, Role.ADMIN)
  @Get()
  listar(
    @Query() query: ListGuardianRelationsQueryDto,
    @CurrentUser() usuario: AuthenticatedUser,
  ) {
    return this.relations.listar(query, usuario);
  }

  @ApiOperation({
    summary: 'Busca um vínculo pelo id',
    description:
      'O dono ou a secretaria/admin. Vínculo de OUTRO responsável dá 403 (existe, mas não é seu).',
  })
  @ApiParam(ID_VINCULO)
  @ApiResponse({
    status: 200,
    description: 'O vínculo (sem o caminho do documento no servidor).',
    schema: { example: EXEMPLO_VINCULO },
  })
  @RespostaCorpoInvalido('Id fora do formato UUID.')
  @RespostaNaoEncontrado('Nenhum vínculo com este id.')
  @RespostaSemPermissao('Este vínculo pertence a outro responsável.')
  @Roles(Role.GUARDIAN, Role.OPERATOR, Role.ADMIN)
  @Get(':id')
  buscar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() usuario: AuthenticatedUser,
  ) {
    return this.relations.buscar(id, usuario);
  }

  @ApiOperation({
    summary: 'Envia o documento de autorização',
    description:
      'Só o responsável DONO do vínculo, e só com o vínculo PENDING ou REJECTED (reenvio volta ' +
      'para PENDING e limpa a análise anterior). O tipo é conferido pelo CONTEÚDO do arquivo ' +
      '(PDF, JPEG ou PNG) — Content-Type e extensão informados não são confiados. Tamanho máximo ' +
      'definido em UPLOAD_MAX_BYTES (padrão 5 MB); acima disso, 413.',
  })
  @ApiParam(ID_VINCULO)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'PDF, JPEG ou PNG.',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Documento recebido; vínculo volta/permanece PENDING.',
    schema: {
      example: {
        ...EXEMPLO_VINCULO,
        documentName: 'autorizacao.pdf',
        documentMime: 'application/pdf',
        documentSize: 45210,
      },
    },
  })
  @RespostaCorpoInvalido(
    'Arquivo ausente, vazio, ou de um tipo não permitido (só PDF, JPEG ou PNG, pelo conteúdo real).',
  )
  @RespostaNaoEncontrado('Nenhum vínculo com este id.')
  @RespostaConflito(
    'O vínculo não está PENDING/REJECTED, OU mudou de estado durante o envio (tente de novo).',
  )
  @ApiResponse({
    status: 413,
    description: 'Arquivo maior que o limite (UPLOAD_MAX_BYTES).',
    schema: {
      // "File too large" é texto do próprio multer (rejeita antes do nosso código rodar);
      // por isso sai em inglês, ao contrário de todo o resto da API. Confirmado ao vivo.
      example: {
        statusCode: 413,
        message: 'File too large',
        error: 'Payload Too Large',
      },
    },
  })
  @RespostaSemPermissao('Só o responsável DONO do vínculo envia o documento.')
  @Roles(Role.GUARDIAN)
  @Post(':id/document')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file'))
  enviarDocumento(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() arquivo: ArquivoEnviado | undefined,
    @CurrentUser() usuario: AuthenticatedUser,
  ) {
    return this.relations.enviarDocumento(id, usuario, arquivo);
  }

  @ApiOperation({
    summary: 'Baixa o documento de autorização',
    description:
      'O dono do vínculo, ou a secretaria/admin. Servido como anexo, sem cache.',
  })
  @ApiParam(ID_VINCULO)
  @ApiProduces('application/pdf', 'image/jpeg', 'image/png')
  @ApiResponse({
    status: 200,
    description: 'O arquivo (binário), com Content-Disposition: attachment.',
  })
  @RespostaCorpoInvalido('Id fora do formato UUID.')
  @RespostaNaoEncontrado(
    'Vínculo sem documento, ou o arquivo não foi encontrado no servidor.',
  )
  @RespostaSemPermissao('Este vínculo pertence a outro responsável.')
  @Header('Cache-Control', 'no-store')
  @Roles(Role.GUARDIAN, Role.OPERATOR, Role.ADMIN)
  @Get(':id/document')
  baixarDocumento(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() usuario: AuthenticatedUser,
  ) {
    return this.relations.baixarDocumento(id, usuario);
  }

  @ApiOperation({
    summary: 'Aprova o vínculo (PENDING -> ACTIVE)',
    description: 'Exige que o documento já tenha sido enviado.',
  })
  @ApiParam(ID_VINCULO)
  @ApiResponse({
    status: 200,
    description: 'Vínculo ativado.',
    schema: {
      example: {
        ...EXEMPLO_VINCULO,
        status: 'ACTIVE',
        reviewedAt: '2026-09-21T13:00:00.000Z',
        reviewedBy: { id: '018f...', name: 'Secretaria' },
      },
    },
  })
  @RespostaCorpoInvalido('Id fora do formato UUID.')
  @RespostaNaoEncontrado('Nenhum vínculo com este id.')
  @RespostaConflito(
    'O vínculo não está PENDING, OU ainda não tem documento enviado.',
  )
  @RespostaSemPermissao()
  @Roles(Role.OPERATOR, Role.ADMIN)
  @Post(':id/approve')
  @HttpCode(200)
  aprovar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() usuario: AuthenticatedUser,
  ) {
    return this.relations.aprovar(id, usuario);
  }

  @ApiOperation({
    summary: 'Rejeita o vínculo (PENDING -> REJECTED)',
    description:
      'Exige um motivo (visível ao responsável, que pode reenviar o documento).',
  })
  @ApiParam(ID_VINCULO)
  @ApiResponse({
    status: 200,
    description: 'Vínculo rejeitado.',
    schema: {
      example: {
        ...EXEMPLO_VINCULO,
        status: 'REJECTED',
        rejectionReason: 'Foto cortada.',
      },
    },
  })
  @RespostaCorpoInvalido()
  @RespostaNaoEncontrado('Nenhum vínculo com este id.')
  @RespostaConflito('O vínculo não está PENDING.')
  @RespostaSemPermissao()
  @Roles(Role.OPERATOR, Role.ADMIN)
  @Post(':id/reject')
  @HttpCode(200)
  rejeitar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectGuardianRelationDto,
    @CurrentUser() usuario: AuthenticatedUser,
  ) {
    return this.relations.rejeitar(id, dto, usuario);
  }

  @ApiOperation({
    summary: 'Revoga o vínculo (ACTIVE -> REVOKED)',
    description: 'Definitivo: o responsável perde o acesso ao aluno na hora.',
  })
  @ApiParam(ID_VINCULO)
  @ApiResponse({
    status: 200,
    description: 'Vínculo revogado.',
    schema: { example: { ...EXEMPLO_VINCULO, status: 'REVOKED' } },
  })
  @RespostaCorpoInvalido('Id fora do formato UUID.')
  @RespostaNaoEncontrado('Nenhum vínculo com este id.')
  @RespostaConflito('O vínculo não está ACTIVE.')
  @RespostaSemPermissao()
  @Roles(Role.OPERATOR, Role.ADMIN)
  @Post(':id/revoke')
  @HttpCode(200)
  revogar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() usuario: AuthenticatedUser,
  ) {
    return this.relations.revogar(id, usuario);
  }
}
