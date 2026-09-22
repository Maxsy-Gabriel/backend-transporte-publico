import {
  Body,
  Controller,
  Delete,
  Get,
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
  RespostaCorpoInvalido,
  RespostaConflito,
  RespostaNaoAutenticado,
  RespostaNaoEncontrado,
  RespostaSemPermissao,
} from '../common/swagger/respostas.js';
import { Role } from '../generated/prisma/client.js';
import { CreateStopDto } from './dto/create-stop.dto.js';
import { StopsService } from './stops.service.js';

const ID_ROTA = {
  name: 'routeId',
  description: 'Id da rota (UUID).',
  example: '018f2f9e-2a3b-7c11-9f21-2b6b7e0a1234',
};
const ID_PONTO = {
  name: 'stopId',
  description: 'Id do ponto (UUID).',
  example: '018f2f9e-2a3b-7c11-9f21-2b6b7e0a5678',
};
const EXEMPLO_PONTO = {
  id: '018f2f9e-2a3b-7c11-9f21-2b6b7e0a5678',
  routeId: '018f2f9e-2a3b-7c11-9f21-2b6b7e0a1234',
  position: 1,
  name: 'Em frente à padaria',
  cep: '01001000',
  street: 'Praça da Sé',
  number: '10',
  complement: null,
  neighborhood: 'Sé',
  city: 'São Paulo',
  state: 'SP',
  latitude: -23.5503,
  longitude: -46.6339,
  createdAt: '2026-09-21T12:00:00.000Z',
};

/** Pontos de uma rota. Criar e remover: secretaria/admin. Listar: também o motorista da rota. */
@ApiTags('Paradas')
@RespostaNaoAutenticado()
@RespostaSemPermissao()
@Roles(Role.OPERATOR, Role.ADMIN)
@Controller('routes/:routeId/stops')
export class StopsController {
  constructor(private readonly stops: StopsService) {}

  @ApiOperation({
    summary: 'Cria um ponto no fim da rota',
    description:
      'Endereço e coordenadas vêm de uma consulta REAL à BrasilAPI (HttpService), a partir do ' +
      'CEP informado. "street"/"neighborhood" só precisam ser enviados se o CEP não os trouxer. ' +
      'Falha do serviço externo: 502 (fora do ar/erro) ou 504 (demorou demais) — nada é gravado.',
  })
  @ApiParam(ID_ROTA)
  @ApiResponse({
    status: 201,
    description: 'Ponto criado, na próxima posição da rota.',
    schema: { example: EXEMPLO_PONTO },
  })
  @RespostaCorpoInvalido(
    'CEP fora do formato (8 dígitos), OU o CEP não traz "street"/"neighborhood" e eles não foram informados.',
  )
  @RespostaNaoEncontrado(
    'Rota não encontrada, OU o CEP não existe na BrasilAPI.',
  )
  @ApiResponse({
    status: 502,
    description:
      'O serviço de CEP está fora do ar, devolveu erro, ou uma resposta fora do formato esperado.',
  })
  @ApiResponse({
    status: 504,
    description: 'O serviço de CEP demorou demais para responder.',
  })
  @Post()
  criar(
    @Param('routeId', ParseUUIDPipe) routeId: string,
    @Body() dto: CreateStopDto,
  ) {
    return this.stops.criar(routeId, dto);
  }

  @ApiOperation({
    summary: 'Lista os pontos da rota',
    description:
      'Em ordem de posição. Também acessível pelo motorista da rota.',
  })
  @ApiParam(ID_ROTA)
  @ApiResponse({
    status: 200,
    description: 'Lista de pontos (pode ser vazia).',
    schema: { example: [EXEMPLO_PONTO] },
  })
  @RespostaNaoEncontrado('Rota não encontrada.')
  @Roles(Role.OPERATOR, Role.ADMIN, Role.DRIVER)
  @Get()
  listar(
    @Param('routeId', ParseUUIDPipe) routeId: string,
    @CurrentUser() usuario: AuthenticatedUser,
  ) {
    return this.stops.listar(routeId, usuario);
  }

  @ApiOperation({
    summary: 'Remove um ponto',
    description:
      'Recusado se houver alunos alocados nele, ou se for o ÚLTIMO ponto de uma rota ACTIVE.',
  })
  @ApiParam(ID_ROTA)
  @ApiParam(ID_PONTO)
  @ApiResponse({
    status: 204,
    description: 'Removido (sem corpo na resposta).',
  })
  @RespostaNaoEncontrado(
    'Rota ou ponto não encontrado (ou o ponto não pertence a esta rota).',
  )
  @RespostaConflito(
    'Há alunos alocados neste ponto, OU é o último ponto de uma rota ACTIVE.',
  )
  @Delete(':stopId')
  @HttpCode(204)
  remover(
    @Param('routeId', ParseUUIDPipe) routeId: string,
    @Param('stopId', ParseUUIDPipe) stopId: string,
  ) {
    return this.stops.remover(routeId, stopId);
  }
}
