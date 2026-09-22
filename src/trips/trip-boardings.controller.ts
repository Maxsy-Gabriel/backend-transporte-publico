import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
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
import { BoardStudentDto } from './dto/board-student.dto.js';
import { TripsService } from './trips.service.js';

const EXEMPLO_EMBARQUE = {
  id: '018f2f9e-2a3b-7c11-9f21-2b6b7e0a9012',
  tripId: '018f2f9e-2a3b-7c11-9f21-2b6b7e0a1234',
  studentId: '018f2f9e-2a3b-7c11-9f21-2b6b7e0a5678',
  status: 'BOARDED',
  boardedAt: '2026-09-21T11:05:00.000Z',
  alightedAt: null,
  student: {
    id: '018f2f9e-2a3b-7c11-9f21-2b6b7e0a5678',
    name: 'Ana Souza',
    registrationNumber: 'MAT-2026-001',
  },
};

/** Embarque de aluno: só o motorista da própria viagem (o service confere "é a minha rota"). */
@ApiTags('Embarque e desembarque')
@RespostaNaoAutenticado()
@RespostaSemPermissao('Você não conduz esta rota.')
@Roles(Role.DRIVER)
@Controller('trips/:tripId/boardings')
export class TripBoardingsController {
  constructor(private readonly trips: TripsService) {}

  @ApiOperation({
    summary: 'Embarca um aluno na viagem',
    description:
      'Só com a viagem em andamento, só um aluno ativo alocado NESTA rota, e só uma vez por ' +
      'viagem (reembarcar depois de desembarcado, na mesma viagem, não é permitido).',
  })
  @ApiParam({
    name: 'tripId',
    description: 'Id da viagem (UUID).',
    example: '018f2f9e-2a3b-7c11-9f21-2b6b7e0a1234',
  })
  @ApiResponse({
    status: 201,
    description: 'Embarque registrado.',
    schema: { example: EXEMPLO_EMBARQUE },
  })
  @RespostaCorpoInvalido()
  @RespostaNaoEncontrado('Viagem ou aluno não encontrado.')
  @RespostaConflito(
    'A viagem não está em andamento, o aluno está inativo/não pertence a esta rota, OU já embarcou nesta viagem.',
  )
  @Post()
  embarcar(
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Body() dto: BoardStudentDto,
    @CurrentUser() usuario: AuthenticatedUser,
  ) {
    return this.trips.embarcar(tripId, dto, usuario);
  }
}
