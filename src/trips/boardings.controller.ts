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

const EXEMPLO_DESEMBARQUE = {
  id: '018f2f9e-2a3b-7c11-9f21-2b6b7e0a9012',
  tripId: '018f2f9e-2a3b-7c11-9f21-2b6b7e0a1234',
  studentId: '018f2f9e-2a3b-7c11-9f21-2b6b7e0a5678',
  status: 'ALIGHTED',
  boardedAt: '2026-09-21T11:05:00.000Z',
  alightedAt: '2026-09-21T11:45:00.000Z',
  student: {
    id: '018f2f9e-2a3b-7c11-9f21-2b6b7e0a5678',
    name: 'Ana Souza',
    registrationNumber: 'MAT-2026-001',
  },
};

/** Desembarque: só o motorista da rota da viagem a que este registro pertence. */
@ApiTags('Embarque e desembarque')
@RespostaNaoAutenticado()
@RespostaSemPermissao('Você não conduz esta rota.')
@Roles(Role.DRIVER)
@Controller('boardings')
export class BoardingsController {
  constructor(private readonly trips: TripsService) {}

  @ApiOperation({
    summary: 'Desembarca um aluno',
    description: 'Só um registro ainda BOARDED (409 se já desembarcado).',
  })
  @ApiParam({
    name: 'id',
    description:
      'Id do registro de embarque (UUID, devolvido pelo POST de embarque).',
    example: '018f2f9e-2a3b-7c11-9f21-2b6b7e0a9012',
  })
  @ApiResponse({
    status: 200,
    description: 'Desembarque registrado.',
    schema: { example: EXEMPLO_DESEMBARQUE },
  })
  @RespostaCorpoInvalido('Id fora do formato UUID.')
  @RespostaNaoEncontrado('Nenhum registro de embarque com este id.')
  @RespostaConflito('Este registro já está ALIGHTED (desembarcado).')
  @Post(':id/alight')
  @HttpCode(200)
  desembarcar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() usuario: AuthenticatedUser,
  ) {
    return this.trips.desembarcar(id, usuario);
  }
}
