import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import {
  RespostaNaoAutenticado,
  RespostaSemPermissao,
} from '../common/swagger/respostas.js';
import { Role } from '../generated/prisma/client.js';
import { StudentsService } from './students.service.js';

/** "Meus alunos": os alunos com vínculo ACTIVE com o responsável autenticado (o id vem do token). */
@ApiTags('Meu perfil')
@RespostaNaoAutenticado()
@RespostaSemPermissao('Só o responsável (GUARDIAN) usa esta rota.')
@Roles(Role.GUARDIAN)
@Controller('me/students')
export class MeStudentsController {
  constructor(private readonly students: StudentsService) {}

  @ApiOperation({
    summary: 'Meus alunos',
    description: 'Só os alunos com vínculo APROVADO (ACTIVE) comigo.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de alunos (pode ser vazia).',
    schema: {
      example: [
        {
          id: '018f...',
          name: 'Ana Souza',
          registrationNumber: 'MAT-2026-001',
          schoolName: 'Escola Municipal Centro',
        },
      ],
    },
  })
  @Get()
  listar(@CurrentUser() usuario: AuthenticatedUser) {
    return this.students.listarDoResponsavel(usuario.id);
  }
}
