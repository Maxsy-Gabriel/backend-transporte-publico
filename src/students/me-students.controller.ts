import { Controller, Get } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { Role } from '../generated/prisma/client.js';
import { StudentsService } from './students.service.js';

/** "Meus alunos": os alunos vinculados ao responsável autenticado (o id vem do token). */
@Roles(Role.GUARDIAN)
@Controller('me/students')
export class MeStudentsController {
  constructor(private readonly students: StudentsService) {}

  @Get()
  listar(@CurrentUser() usuario: AuthenticatedUser) {
    return this.students.listarDoResponsavel(usuario.id);
  }
}
