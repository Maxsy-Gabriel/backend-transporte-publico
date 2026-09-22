import { Module } from '@nestjs/common';
import { GeoModule } from '../geo/geo.module.js';
import { MeRoutesController } from './me-routes.controller.js';
import { RoutesController } from './routes.controller.js';
import { RoutesService } from './routes.service.js';
import { StopsController } from './stops.controller.js';
import { StopsService } from './stops.service.js';

@Module({
  imports: [GeoModule],
  controllers: [RoutesController, StopsController, MeRoutesController],
  providers: [RoutesService, StopsService],
})
export class RoutesModule {}
