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
import { RoutesService } from './routes.service.js';

/** "Minhas rotas": as rotas do motorista autenticado (o id vem do token). */
@ApiTags('Meu perfil')
@RespostaNaoAutenticado()
@RespostaSemPermissao('Só o motorista (DRIVER) usa esta rota.')
@Roles(Role.DRIVER)
@Controller('me/routes')
export class MeRoutesController {
  constructor(private readonly routes: RoutesService) {}

  @ApiOperation({
    summary: 'Minhas rotas',
    description:
      'As rotas que EU (motorista autenticado) conduzo, de qualquer situação.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de rotas (pode ser vazia).',
    schema: {
      example: [
        {
          id: '018f...',
          name: 'Rota Centro',
          shift: 'MORNING',
          status: 'ACTIVE',
        },
      ],
    },
  })
  @Get()
  listar(@CurrentUser() usuario: AuthenticatedUser) {
    return this.routes.listarDoMotorista(usuario.id);
  }
}
