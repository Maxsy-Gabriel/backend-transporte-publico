import { Module } from '@nestjs/common';
import { StudentsController } from './students.controller.js';
import { StudentsService } from './students.service.js';
import { MeStudentsController } from './me-students.controller.js';

@Module({
  controllers: [StudentsController, MeStudentsController],
  providers: [StudentsService],
})
export class StudentsModule {}
