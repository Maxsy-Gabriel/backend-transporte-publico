import {
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { Role } from '../generated/prisma/client.js';
import { TripsService } from './trips.service.js';

/** Desembarque: só o motorista da rota da viagem a que este registro pertence. */
@Roles(Role.DRIVER)
@Controller('boardings')
export class BoardingsController {
  constructor(private readonly trips: TripsService) {}

  @Post(':id/alight')
  @HttpCode(200)
  desembarcar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() usuario: AuthenticatedUser,
  ) {
    return this.trips.desembarcar(id, usuario);
  }
}
