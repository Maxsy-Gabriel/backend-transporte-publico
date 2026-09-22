import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { Role } from '../generated/prisma/client.js';
import { BoardStudentDto } from './dto/board-student.dto.js';
import { TripsService } from './trips.service.js';

/** Embarque de aluno: só o motorista da própria viagem (o service confere "é a minha rota"). */
@Roles(Role.DRIVER)
@Controller('trips/:tripId/boardings')
export class TripBoardingsController {
  constructor(private readonly trips: TripsService) {}

  @Post()
  embarcar(
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Body() dto: BoardStudentDto,
    @CurrentUser() usuario: AuthenticatedUser,
  ) {
    return this.trips.embarcar(tripId, dto, usuario);
  }
}
