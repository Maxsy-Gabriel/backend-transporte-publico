import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import {
  RespostaConflito,
  RespostaCorpoInvalido,
  RespostaNaoAutenticado,
  RespostaNaoEncontrado,
  RespostaSemPermissao,
} from '../common/swagger/respostas.js';
import { Role } from '../generated/prisma/client.js';
import { ListTripsQueryDto } from './dto/list-trips-query.dto.js';
import { TripsService } from './trips.service.js';

const ID_VIAGEM = {
  name: 'id',
  description: 'Id da viagem (UUID).',
  example: '018f2f9e-2a3b-7c11-9f21-2b6b7e0a1234',
};
const EXEMPLO_VIAGEM = {
  id: '018f2f9e-2a3b-7c11-9f21-2b6b7e0a1234',
  routeId: '018f2f9e-2a3b-7c11-9f21-2b6b7e0a5678',
  status: 'IN_PROGRESS',
  startedAt: '2026-09-21T11:00:00.000Z',
  finishedAt: null,
  route: {
    id: '018f2f9e-2a3b-7c11-9f21-2b6b7e0a5678',
    name: 'Rota Centro',
    shift: 'MORNING',
  },
};

/** Consulta e finalização de viagens. Secretaria/admin veem todas; o motorista só as suas. */
@ApiTags('Viagens')
@RespostaNaoAutenticado()
@RespostaSemPermissao()
@Roles(Role.OPERATOR, Role.ADMIN, Role.DRIVER)
@Controller('trips')
export class TripsController {
  constructor(private readonly trips: TripsService) {}

  @ApiOperation({
    summary: 'Lista as viagens',
    description: 'Paginado; filtra por situação, rota e período (from/to).',
  })
  @ApiResponse({
    status: 200,
    description: 'Página de viagens.',
    schema: {
      example: { data: [EXEMPLO_VIAGEM], total: 1, page: 1, limit: 20 },
    },
  })
  @RespostaCorpoInvalido(
    'Página, limite, situação, routeId ou from/to fora do formato aceito (ou from depois de to).',
  )
  @Get()
  listar(
    @Query() query: ListTripsQueryDto,
    @CurrentUser() usuario: AuthenticatedUser,
  ) {
    return this.trips.listar(query, usuario);
  }

  @ApiOperation({ summary: 'Busca uma viagem pelo id' })
  @ApiParam(ID_VIAGEM)
  @ApiResponse({
    status: 200,
    description: 'A viagem.',
    schema: { example: EXEMPLO_VIAGEM },
  })
  @RespostaCorpoInvalido('Id fora do formato UUID.')
  @RespostaNaoEncontrado('Nenhuma viagem com este id.')
  @Get(':id')
  buscar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() usuario: AuthenticatedUser,
  ) {
    return this.trips.buscar(id, usuario);
  }

  @ApiOperation({
    summary: 'Quem embarcou/desembarcou nesta viagem',
    description: 'A "lista de chamada" da viagem, em ordem de embarque.',
  })
  @ApiParam(ID_VIAGEM)
  @ApiResponse({
    status: 200,
    description: 'Lista de embarques (pode ser vazia).',
    schema: {
      example: [
        {
          id: '018f...',
          status: 'ALIGHTED',
          boardedAt: '2026-09-21T11:05:00.000Z',
          alightedAt: '2026-09-21T11:45:00.000Z',
          student: {
            id: '018f...',
            name: 'Ana Souza',
            registrationNumber: 'MAT-2026-001',
          },
        },
      ],
    },
  })
  @RespostaNaoEncontrado('Nenhuma viagem com este id.')
  @Get(':id/boardings')
  embarques(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() usuario: AuthenticatedUser,
  ) {
    return this.trips.embarques(id, usuario);
  }

  @ApiOperation({
    summary: 'Finaliza a viagem',
    description:
      'Só o motorista da rota, só uma viagem em andamento, e só sem NINGUÉM a bordo (desembarque de todos precede a finalização).',
  })
  @ApiParam(ID_VIAGEM)
  @ApiResponse({
    status: 200,
    description: 'Viagem finalizada.',
    schema: {
      example: {
        ...EXEMPLO_VIAGEM,
        status: 'FINISHED',
        finishedAt: '2026-09-21T11:50:00.000Z',
      },
    },
  })
  @RespostaCorpoInvalido('Id fora do formato UUID.')
  @RespostaNaoEncontrado('Nenhuma viagem com este id.')
  @RespostaConflito(
    'A viagem já foi finalizada, OU há alunos a bordo (a mensagem informa quantos).',
  )
  @RespostaSemPermissao('Você não conduz esta rota.')
  @Roles(Role.DRIVER)
  @Post(':id/finish')
  @HttpCode(200)
  finalizar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() usuario: AuthenticatedUser,
  ) {
    return this.trips.finalizar(id, usuario);
  }
}
