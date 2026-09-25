import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import {
  RespostaCorpoInvalido,
  RespostaConflito,
  RespostaNaoAutenticado,
  RespostaNaoEncontrado,
  RespostaSemPermissao,
} from '../common/swagger/respostas.js';
import { Role } from '../generated/prisma/client.js';
import { AssignRouteDto } from './dto/assign-route.dto.js';
import { CreateStudentDto } from './dto/create-student.dto.js';
import { ListStudentsQueryDto } from './dto/list-students-query.dto.js';
import { UpdateStudentDto } from './dto/update-student.dto.js';
import { StudentsService } from './students.service.js';

const ID_ALUNO = {
  name: 'id',
  description: 'Id do aluno (UUID).',
  example: '018f2f9e-2a3b-7c11-9f21-2b6b7e0a1234',
};
const EXEMPLO_ALUNO = {
  id: '018f2f9e-2a3b-7c11-9f21-2b6b7e0a1234',
  name: 'Ana Souza',
  registrationNumber: 'MAT-2026-001',
  schoolName: 'Escola Municipal Centro',
  active: true,
  route: { id: '018f...', name: 'Rota Centro', shift: 'MORNING' },
  stop: {
    id: '018f...',
    position: 1,
    name: 'Em frente à padaria',
    street: 'Praça da Sé',
    number: '10',
    neighborhood: 'Sé',
    city: 'São Paulo',
  },
  birthDate: '2016-03-20',
  createdAt: '2026-09-21T12:00:00.000Z',
  updatedAt: '2026-09-21T12:00:00.000Z',
};

/**
 * Gestão de alunos: escrita e listagem geral só para a secretaria (OPERATOR) e o ADMIN. Ver UM
 * aluno também é permitido ao responsável vinculado e ao motorista da rota dele; a regra de
 * "é o meu aluno" fica no service (403 nos demais).
 */
@ApiTags('Alunos')
@RespostaNaoAutenticado()
@RespostaSemPermissao()
@Roles(Role.OPERATOR, Role.ADMIN)
@Controller('students')
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @ApiOperation({
    summary: 'Cadastra um aluno',
    description:
      'Nasce sem rota; ela é atribuída em PATCH /students/:id/route.',
  })
  @ApiResponse({
    status: 201,
    description: 'Aluno criado.',
    schema: { example: { ...EXEMPLO_ALUNO, route: null, stop: null } },
  })
  @RespostaCorpoInvalido('Campo inválido, OU birthDate no futuro.')
  @RespostaConflito('Já existe um aluno com esta matrícula.')
  @Post()
  criar(@Body() dto: CreateStudentDto) {
    return this.students.criar(dto);
  }

  @ApiOperation({
    summary: 'Lista os alunos',
    description: 'Paginado; busca por nome/matrícula e filtro por rota.',
  })
  @ApiResponse({
    status: 200,
    description: 'Página de alunos.',
    schema: {
      example: { data: [EXEMPLO_ALUNO], total: 1, page: 1, limit: 20 },
    },
  })
  @RespostaCorpoInvalido('Página, limite ou routeId fora do formato aceito.')
  @Get()
  listar(@Query() query: ListStudentsQueryDto) {
    return this.students.listar(query);
  }

  @ApiOperation({
    summary: 'Busca um aluno pelo id',
    description:
      'Secretaria/admin veem qualquer um. Responsável: só com vínculo ACTIVE (403 caso contrário). ' +
      'Motorista: só alunos da PRÓPRIA rota, e sem a data de nascimento na resposta.',
  })
  @ApiParam(ID_ALUNO)
  @ApiResponse({
    status: 200,
    description: 'O aluno.',
    schema: { example: EXEMPLO_ALUNO },
  })
  @RespostaCorpoInvalido('Id fora do formato UUID.')
  @RespostaNaoEncontrado('Nenhum aluno com este id.')
  @Roles(Role.OPERATOR, Role.ADMIN, Role.DRIVER, Role.GUARDIAN)
  @Get(':id')
  buscar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() usuario: AuthenticatedUser,
  ) {
    return this.students.buscar(id, usuario);
  }

  @ApiOperation({
    summary: 'Altera um aluno',
    description:
      'Desativar (`active:false`) tira o aluno da rota (libera a vaga); recusado (409) se ele estiver a bordo.',
  })
  @ApiParam(ID_ALUNO)
  @ApiResponse({
    status: 200,
    description: 'Aluno atualizado.',
    schema: { example: EXEMPLO_ALUNO },
  })
  @RespostaCorpoInvalido()
  @RespostaNaoEncontrado('Nenhum aluno com este id.')
  @RespostaConflito(
    'Nova matrícula já usada, OU o aluno está a bordo de uma viagem em andamento.',
  )
  @Patch(':id')
  atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStudentDto,
  ) {
    return this.students.atualizar(id, dto);
  }

  @ApiOperation({
    summary: 'Aloca o aluno numa rota, ou o retira dela',
    description:
      'A REGRA DE CAPACIDADE do AV-09: a rota nunca tem mais alunos ativos do que os lugares ' +
      'do veículo (checado dentro de uma transação com a rota travada, à prova de corrida). ' +
      '`{ routeId: null }` retira o aluno da rota.',
  })
  @ApiParam(ID_ALUNO)
  @ApiResponse({
    status: 200,
    description: 'Aluno alocado/retirado.',
    schema: { example: EXEMPLO_ALUNO },
  })
  @RespostaCorpoInvalido()
  @RespostaNaoEncontrado('Aluno, rota ou ponto não encontrado.')
  @RespostaConflito(
    'Aluno inativo, rota inativa, rota sem veículo, ponto de outra rota, aluno a bordo de uma ' +
      'viagem em andamento, OU a rota está lotada (alunos ativos = capacidade do veículo).',
  )
  @Patch(':id/route')
  alocar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignRouteDto) {
    return this.students.alocar(id, dto);
  }

  @ApiOperation({
    summary: 'Responsáveis do aluno',
    description:
      'Consulta por relacionamento: todo vínculo, de qualquer situação.',
  })
  @ApiParam(ID_ALUNO)
  @ApiResponse({
    status: 200,
    description: 'Lista de vínculos (pode ser vazia).',
    schema: {
      example: [
        {
          id: '018f...',
          relationship: 'MOTHER',
          status: 'ACTIVE',
          createdAt: '2026-09-21T12:00:00.000Z',
          guardian: {
            id: '018f...',
            name: 'Ana Souza',
            email: 'ana.souza@example.com',
          },
        },
      ],
    },
  })
  @RespostaNaoEncontrado('Nenhum aluno com este id.')
  @Get(':id/guardians')
  responsaveis(@Param('id', ParseUUIDPipe) id: string) {
    return this.students.responsaveis(id);
  }

  @ApiOperation({
    summary: 'Histórico de embarques/desembarques do aluno',
    description: 'Paginado; mesma regra de acesso do GET /students/:id.',
  })
  @ApiParam(ID_ALUNO)
  @ApiResponse({
    status: 200,
    description: 'Página do histórico.',
    schema: {
      example: {
        data: [
          {
            id: '018f...',
            status: 'ALIGHTED',
            boardedAt: '2026-09-21T11:00:00.000Z',
            alightedAt: '2026-09-21T11:45:00.000Z',
            trip: {
              id: '018f...',
              status: 'FINISHED',
              startedAt: '2026-09-21T11:00:00.000Z',
              finishedAt: '2026-09-21T11:50:00.000Z',
              route: { id: '018f...', name: 'Rota Centro', shift: 'MORNING' },
            },
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      },
    },
  })
  @RespostaCorpoInvalido(
    'Id fora do formato UUID, ou página/limite fora do formato aceito.',
  )
  @RespostaNaoEncontrado('Nenhum aluno com este id.')
  @Roles(Role.OPERATOR, Role.ADMIN, Role.DRIVER, Role.GUARDIAN)
  @Get(':id/boardings')
  embarques(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
    @CurrentUser() usuario: AuthenticatedUser,
  ) {
    return this.students.embarques(id, query, usuario);
  }

  @ApiOperation({
    summary: 'Desativa um aluno (soft delete)',
    description:
      'Equivalente a `PATCH /students/:id { active: false }` — o registro nunca é apagado, só ' +
      'desativado (mesma regra de negócio, mesmas restrições: tira da rota, libera a vaga).',
  })
  @ApiParam(ID_ALUNO)
  @ApiResponse({
    status: 204,
    description: 'Aluno desativado (sem corpo na resposta).',
  })
  @RespostaCorpoInvalido('Id fora do formato UUID.')
  @RespostaNaoEncontrado('Nenhum aluno com este id.')
  @RespostaConflito('O aluno está a bordo de uma viagem em andamento.')
  @Delete(':id')
  @HttpCode(204)
  async excluir(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.students.atualizar(id, { active: false });
  }
}
