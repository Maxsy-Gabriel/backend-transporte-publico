import { Module } from '@nestjs/common';
import { BoardingsController } from './boardings.controller.js';
import { RouteTripsController } from './route-trips.controller.js';
import { TripBoardingsController } from './trip-boardings.controller.js';
import { TripsController } from './trips.controller.js';
import { TripsService } from './trips.service.js';

@Module({
  controllers: [
    RouteTripsController,
    TripsController,
    TripBoardingsController,
    BoardingsController,
  ],
  providers: [TripsService],
})
export class TripsModule {}
