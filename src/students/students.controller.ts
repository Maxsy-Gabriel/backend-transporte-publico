import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { Role } from '../generated/prisma/client.js';
import { AssignRouteDto } from './dto/assign-route.dto.js';
import { CreateStudentDto } from './dto/create-student.dto.js';
import { ListStudentsQueryDto } from './dto/list-students-query.dto.js';
import { UpdateStudentDto } from './dto/update-student.dto.js';
import { StudentsService } from './students.service.js';

/**
 * Gestão de alunos: escrita e listagem geral só para a secretaria (OPERATOR) e o ADMIN. Ver UM
 * aluno também é permitido ao responsável vinculado e ao motorista da rota dele; a regra de
 * "é o meu aluno" fica no service (403 nos demais).
 */
@Roles(Role.OPERATOR, Role.ADMIN)
@Controller('students')
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Post()
  criar(@Body() dto: CreateStudentDto) {
    return this.students.criar(dto);
  }

  @Get()
  listar(@Query() query: ListStudentsQueryDto) {
    return this.students.listar(query);
  }

  @Roles(Role.OPERATOR, Role.ADMIN, Role.DRIVER, Role.GUARDIAN)
  @Get(':id')
  buscar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() usuario: AuthenticatedUser,
  ) {
    return this.students.buscar(id, usuario);
  }

  @Patch(':id')
  atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStudentDto,
  ) {
    return this.students.atualizar(id, dto);
  }

  /** Coloca o aluno numa rota (confere a capacidade) ou o retira dela (`routeId: null`). */
  @Patch(':id/route')
  alocar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignRouteDto) {
    return this.students.alocar(id, dto);
  }

  /** Responsáveis do aluno e a situação de cada vínculo. */
  @Get(':id/guardians')
  responsaveis(@Param('id', ParseUUIDPipe) id: string) {
    return this.students.responsaveis(id);
  }

  /** Histórico de embarques/desembarques do aluno, paginado (mesma regra de acesso do GET :id). */
  @Roles(Role.OPERATOR, Role.ADMIN, Role.DRIVER, Role.GUARDIAN)
  @Get(':id/boardings')
  embarques(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
    @CurrentUser() usuario: AuthenticatedUser,
  ) {
    return this.students.embarques(id, query, usuario);
  }
}
