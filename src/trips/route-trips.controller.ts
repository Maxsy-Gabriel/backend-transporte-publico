import {
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
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
import { TripsService } from './trips.service.js';

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

/** Início de viagem: só o motorista da própria viagem (o service confere "é a minha rota"). */
@ApiTags('Viagens')
@RespostaNaoAutenticado()
@RespostaSemPermissao('Você não conduz esta rota.')
@Roles(Role.DRIVER)
@Controller('routes/:routeId/trips')
export class RouteTripsController {
  constructor(private readonly trips: TripsService) {}

  @ApiOperation({
    summary: 'Inicia uma viagem da rota',
    description:
      'Só o motorista DA ROTA, só rota ACTIVE, e a CNH é checada de novo (pode ter vencido ' +
      'depois da rota ter sido ativada). Só 1 viagem em andamento por rota.',
  })
  @ApiParam({
    name: 'routeId',
    description: 'Id da rota (UUID).',
    example: '018f2f9e-2a3b-7c11-9f21-2b6b7e0a5678',
  })
  @ApiResponse({
    status: 201,
    description: 'Viagem iniciada.',
    schema: { example: EXEMPLO_VIAGEM },
  })
  @RespostaCorpoInvalido('Id fora do formato UUID.')
  @RespostaNaoEncontrado('Nenhuma rota com este id.')
  @RespostaConflito(
    'A rota não está ACTIVE, sua CNH está vencida, OU já existe uma viagem em andamento nesta rota.',
  )
  @Post()
  @HttpCode(201)
  iniciar(
    @Param('routeId', ParseUUIDPipe) routeId: string,
    @CurrentUser() usuario: AuthenticatedUser,
  ) {
    return this.trips.iniciar(routeId, usuario);
  }
}
