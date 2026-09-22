import { Module } from '@nestjs/common';
import { DriversController } from './drivers.controller.js';
import { DriversService } from './drivers.service.js';

@Module({
  controllers: [DriversController],
  providers: [DriversService],
})
export class DriversModule {}
