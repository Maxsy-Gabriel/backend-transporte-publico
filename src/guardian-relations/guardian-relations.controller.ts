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
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { Role } from '../generated/prisma/client.js';
import { CreateGuardianRelationDto } from './dto/create-guardian-relation.dto.js';
import { ListGuardianRelationsQueryDto } from './dto/list-guardian-relations-query.dto.js';
import { RejectGuardianRelationDto } from './dto/reject-guardian-relation.dto.js';
import {
  GuardianRelationsService,
  type ArquivoEnviado,
} from './guardian-relations.service.js';

/**
 * Vínculos responsável-aluno. Criar, aprovar, rejeitar e revogar: secretaria/admin. Ver: o dono
 * do vínculo e a secretaria/admin. Enviar o documento: só o responsável dono (upload).
 */
@Controller('guardian-relations')
export class GuardianRelationsController {
  constructor(private readonly relations: GuardianRelationsService) {}

  @Roles(Role.OPERATOR, Role.ADMIN)
  @Post()
  criar(@Body() dto: CreateGuardianRelationDto) {
    return this.relations.criar(dto);
  }

  @Roles(Role.GUARDIAN, Role.OPERATOR, Role.ADMIN)
  @Get()
  listar(
    @Query() query: ListGuardianRelationsQueryDto,
    @CurrentUser() usuario: AuthenticatedUser,
  ) {
    return this.relations.listar(query, usuario);
  }

  @Roles(Role.GUARDIAN, Role.OPERATOR, Role.ADMIN)
  @Get(':id')
  buscar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() usuario: AuthenticatedUser,
  ) {
    return this.relations.buscar(id, usuario);
  }

  /**
   * Upload do documento de autorização (multipart/form-data, campo "file"). O limite de tamanho
   * vem do ambiente (UPLOAD_MAX_BYTES) e é aplicado durante a leitura: acima dele, 413.
   */
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

  /** Download do documento. Documento pessoal: nunca fica em cache. */
  @Roles(Role.GUARDIAN, Role.OPERATOR, Role.ADMIN)
  @Get(':id/document')
  @Header('Cache-Control', 'no-store')
  baixarDocumento(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() usuario: AuthenticatedUser,
  ) {
    return this.relations.baixarDocumento(id, usuario);
  }

  @Roles(Role.OPERATOR, Role.ADMIN)
  @Post(':id/approve')
  @HttpCode(200)
  aprovar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() usuario: AuthenticatedUser,
  ) {
    return this.relations.aprovar(id, usuario);
  }

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
