import { Module } from '@nestjs/common';
import { MeController } from './me.controller.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  controllers: [UsersController, MeController],
  providers: [UsersService],
})
export class UsersModule {}
