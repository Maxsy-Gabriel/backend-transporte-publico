import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { Role } from '../generated/prisma/client.js';
import { ListTripsQueryDto } from './dto/list-trips-query.dto.js';
import { TripsService } from './trips.service.js';

/** Consulta e finalização de viagens. Secretaria/admin veem todas; o motorista só as suas. */
@Roles(Role.OPERATOR, Role.ADMIN, Role.DRIVER)
@Controller('trips')
export class TripsController {
  constructor(private readonly trips: TripsService) {}

  @Get()
  listar(
    @Query() query: ListTripsQueryDto,
    @CurrentUser() usuario: AuthenticatedUser,
  ) {
    return this.trips.listar(query, usuario);
  }

  @Get(':id')
  buscar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() usuario: AuthenticatedUser,
  ) {
    return this.trips.buscar(id, usuario);
  }

  /** Quem embarcou/desembarcou nesta viagem. */
  @Get(':id/boardings')
  embarques(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() usuario: AuthenticatedUser,
  ) {
    return this.trips.embarques(id, usuario);
  }

  /** Só o motorista da rota finaliza (o service confere). */
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
