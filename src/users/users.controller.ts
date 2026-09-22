import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import {
  RespostaCorpoInvalido,
  RespostaConflito,
  RespostaNaoAutenticado,
  RespostaNaoEncontrado,
  RespostaSemPermissao,
} from '../common/swagger/respostas.js';
import { Role } from '../generated/prisma/client.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UsersService } from './users.service.js';

const ID_USUARIO = {
  name: 'id',
  description: 'Id do usuário (UUID).',
  example: '018f2f9e-2a3b-7c11-9f21-2b6b7e0a1234',
};
const EXEMPLO_USUARIO = {
  id: '018f2f9e-2a3b-7c11-9f21-2b6b7e0a1234',
  name: 'João Motorista',
  email: 'joao@example.com',
  role: 'DRIVER',
  active: true,
  createdAt: '2026-09-21T12:00:00.000Z',
  updatedAt: '2026-09-21T12:00:00.000Z',
};

/** Administração de usuários: o @Roles no nível da classe vale para todas as rotas (só ADMIN). */
@ApiTags('Usuários (admin)')
@RespostaNaoAutenticado()
@RespostaSemPermissao()
@Roles(Role.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @ApiOperation({
    summary: 'Cria um usuário com o papel escolhido',
    description:
      'Único jeito de criar DRIVER, OPERATOR ou ADMIN (o cadastro público só cria GUARDIAN).',
  })
  @ApiResponse({
    status: 201,
    description: 'Usuário criado.',
    schema: { example: EXEMPLO_USUARIO },
  })
  @RespostaCorpoInvalido()
  @RespostaConflito('Já existe um usuário com este e-mail.')
  @Post()
  criar(@Body() dto: CreateUserDto) {
    return this.users.criar(dto);
  }

  @ApiOperation({
    summary: 'Lista os usuários',
    description: 'Paginado, sem filtros.',
  })
  @ApiResponse({
    status: 200,
    description: 'Página de usuários.',
    schema: {
      example: { data: [EXEMPLO_USUARIO], total: 1, page: 1, limit: 20 },
    },
  })
  @RespostaCorpoInvalido('Página ou limite fora do formato aceito.')
  @Get()
  listar(@Query() query: PaginationQueryDto) {
    return this.users.listar(query);
  }

  @ApiOperation({ summary: 'Busca um usuário pelo id' })
  @ApiParam(ID_USUARIO)
  @ApiResponse({
    status: 200,
    description: 'O usuário.',
    schema: { example: EXEMPLO_USUARIO },
  })
  @RespostaCorpoInvalido('Id fora do formato UUID.')
  @RespostaNaoEncontrado('Nenhum usuário com este id.')
  @Get(':id')
  buscar(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.buscar(id);
  }

  @ApiOperation({
    summary: 'Altera um usuário',
    description:
      'Um ADMIN não pode desativar nem rebaixar a PRÓPRIA conta (409), para não se trancar fora do sistema.',
  })
  @ApiParam(ID_USUARIO)
  @ApiResponse({
    status: 200,
    description: 'Usuário atualizado.',
    schema: { example: EXEMPLO_USUARIO },
  })
  @RespostaCorpoInvalido()
  @RespostaNaoEncontrado('Nenhum usuário com este id.')
  @RespostaConflito(
    'Você tentou desativar/rebaixar a própria conta, OU este usuário conduz uma rota ativa ' +
      'no momento (não pode perder o papel DRIVER nem ser desativado agora).',
  )
  @Patch(':id')
  atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() atual: AuthenticatedUser,
  ) {
    return this.users.atualizar(id, dto, atual);
  }
}
