import {
  Body,
  Controller,
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
import {
  RespostaCorpoInvalido,
  RespostaConflito,
  RespostaNaoAutenticado,
  RespostaNaoEncontrado,
  RespostaSemPermissao,
} from '../common/swagger/respostas.js';
import { Role } from '../generated/prisma/client.js';
import { CreateRouteDto } from './dto/create-route.dto.js';
import { ListRoutesQueryDto } from './dto/list-routes-query.dto.js';
import { UpdateRouteDto } from './dto/update-route.dto.js';
import { RoutesService } from './routes.service.js';

const ID_ROTA = {
  name: 'id',
  description: 'Id da rota (UUID).',
  example: '018f2f9e-2a3b-7c11-9f21-2b6b7e0a1234',
};
const EXEMPLO_ROTA = {
  id: '018f2f9e-2a3b-7c11-9f21-2b6b7e0a1234',
  name: 'Rota Centro',
  shift: 'MORNING',
  status: 'DRAFT',
  vehicle: {
    id: '018f...',
    plate: 'ABC1D23',
    model: 'Van Escolar',
    capacity: 15,
    status: 'ACTIVE',
  },
  driver: {
    id: '018f...',
    active: true,
    licenseExpiresAt: '2029-12-31',
    user: { id: '018f...', name: 'João Motorista' },
  },
  stopsCount: 3,
  studentsCount: 12,
};

/**
 * Gestão de rotas: escrita só para a secretaria (OPERATOR) e o ADMIN. O motorista (DRIVER) pode
 * LER as rotas que conduz; ler uma rota alheia dá 403 (checado no service, não no @Roles).
 */
@ApiTags('Rotas')
@RespostaNaoAutenticado()
@RespostaSemPermissao()
@Roles(Role.OPERATOR, Role.ADMIN)
@Controller('routes')
export class RoutesController {
  constructor(private readonly routes: RoutesService) {}

  @ApiOperation({
    summary: 'Cria uma rota',
    description:
      'Nasce sempre em DRAFT (rascunho) — enviar "status" no corpo é rejeitado (400).',
  })
  @ApiResponse({
    status: 201,
    description: 'Rota criada.',
    schema: {
      example: {
        ...EXEMPLO_ROTA,
        vehicle: null,
        driver: null,
        stopsCount: 0,
        studentsCount: 0,
      },
    },
  })
  @RespostaCorpoInvalido()
  @RespostaNaoEncontrado('vehicleId ou driverId informado não existe.')
  @RespostaConflito(
    'Já existe uma rota com este nome neste turno, OU o veículo/motorista informado não está apto ' +
      '(veículo fora de ACTIVE, motorista inativo ou com CNH vencida).',
  )
  @Post()
  criar(@Body() dto: CreateRouteDto) {
    return this.routes.criar(dto);
  }

  @ApiOperation({
    summary: 'Lista as rotas',
    description:
      'Paginado, com filtros opcionais. Secretaria/admin veem todas; o motorista só as que conduz.',
  })
  @ApiResponse({
    status: 200,
    description: 'Página de rotas.',
    schema: { example: { data: [EXEMPLO_ROTA], total: 1, page: 1, limit: 20 } },
  })
  @RespostaCorpoInvalido(
    'Página, limite, situação ou turno fora do formato aceito.',
  )
  @Roles(Role.OPERATOR, Role.ADMIN, Role.DRIVER)
  @Get()
  listar(
    @Query() query: ListRoutesQueryDto,
    @CurrentUser() usuario: AuthenticatedUser,
  ) {
    return this.routes.listar(query, usuario);
  }

  @ApiOperation({
    summary: 'Busca uma rota pelo id',
    description:
      'O motorista só vê a PRÓPRIA rota (403 nas alheias, mesmo existindo).',
  })
  @ApiParam(ID_ROTA)
  @ApiResponse({
    status: 200,
    description: 'A rota (com lotação e contagem de pontos).',
    schema: { example: EXEMPLO_ROTA },
  })
  @RespostaCorpoInvalido('Id fora do formato UUID.')
  @RespostaNaoEncontrado('Nenhuma rota com este id.')
  @Roles(Role.OPERATOR, Role.ADMIN, Role.DRIVER)
  @Get(':id')
  buscar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() usuario: AuthenticatedUser,
  ) {
    return this.routes.buscar(id, usuario);
  }

  @ApiOperation({
    summary: 'Altera uma rota',
    description:
      'Alteração parcial. Uma rota ACTIVE não pode ficar sem veículo nem sem motorista.',
  })
  @ApiParam(ID_ROTA)
  @ApiResponse({
    status: 200,
    description: 'Rota atualizada.',
    schema: { example: EXEMPLO_ROTA },
  })
  @RespostaCorpoInvalido()
  @RespostaNaoEncontrado('Rota, veículo ou motorista informado não existe.')
  @RespostaConflito(
    'Nome já usado no turno, rota ACTIVE ficaria sem veículo/motorista, novo veículo é menor ' +
      'que a lotação atual, OU o motorista/veículo novo não está apto.',
  )
  @Patch(':id')
  atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRouteDto,
  ) {
    return this.routes.atualizar(id, dto);
  }

  @ApiOperation({
    summary: 'Ativa a rota (DRAFT/INACTIVE -> ACTIVE)',
    description:
      'Exige veículo ACTIVE, motorista ativo com CNH válida, e pelo menos 1 ponto. O 409 lista TUDO que falta de uma vez.',
  })
  @ApiParam(ID_ROTA)
  @ApiResponse({
    status: 200,
    description: 'Rota ativada.',
    schema: { example: { ...EXEMPLO_ROTA, status: 'ACTIVE' } },
  })
  @RespostaCorpoInvalido('Id fora do formato UUID.')
  @RespostaNaoEncontrado('Nenhuma rota com este id.')
  @RespostaConflito(
    'Já está ACTIVE, OU falta veículo apto, motorista apto ou algum ponto (a mensagem lista tudo que falta).',
  )
  @Post(':id/activate')
  @HttpCode(200)
  ativar(@Param('id', ParseUUIDPipe) id: string) {
    return this.routes.ativar(id);
  }

  @ApiOperation({ summary: 'Desativa a rota (ACTIVE -> INACTIVE)' })
  @ApiParam(ID_ROTA)
  @ApiResponse({
    status: 200,
    description: 'Rota desativada.',
    schema: { example: { ...EXEMPLO_ROTA, status: 'INACTIVE' } },
  })
  @RespostaCorpoInvalido('Id fora do formato UUID.')
  @RespostaNaoEncontrado('Nenhuma rota com este id.')
  @RespostaConflito(
    'A rota não está ACTIVE, OU há uma viagem em andamento nela.',
  )
  @Post(':id/deactivate')
  @HttpCode(200)
  desativar(@Param('id', ParseUUIDPipe) id: string) {
    return this.routes.desativar(id);
  }

  @ApiOperation({
    summary: 'Alunos ativos desta rota',
    description: 'Consulta por relacionamento, ordenada por ponto e nome.',
  })
  @ApiParam(ID_ROTA)
  @ApiResponse({
    status: 200,
    description: 'Lista de alunos (pode ser vazia).',
    schema: {
      example: [
        {
          id: '018f...',
          name: 'Aluno Exemplo',
          registrationNumber: 'MAT-001',
          schoolName: 'Escola Municipal',
        },
      ],
    },
  })
  @RespostaNaoEncontrado('Nenhuma rota com este id.')
  @Roles(Role.OPERATOR, Role.ADMIN, Role.DRIVER)
  @Get(':id/students')
  alunos(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() usuario: AuthenticatedUser,
  ) {
    return this.routes.alunos(id, usuario);
  }
}
