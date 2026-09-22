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

/** Início de viagem: só o motorista da própria rota ("é a minha rota" é checado no service). */
@Roles(Role.DRIVER)
@Controller('routes/:routeId/trips')
export class RouteTripsController {
  constructor(private readonly trips: TripsService) {}

  @Post()
  @HttpCode(201)
  iniciar(
    @Param('routeId', ParseUUIDPipe) routeId: string,
    @CurrentUser() usuario: AuthenticatedUser,
  ) {
    return this.trips.iniciar(routeId, usuario);
  }
}
