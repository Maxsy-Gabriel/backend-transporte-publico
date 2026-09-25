import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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

/**
 * Administração de usuários. Criar/alterar conta (papel, ativo/inativo) é só ADMIN — é quem
 * decide "quem pode ser o quê" no sistema. A LEITURA (listar/buscar) também libera OPERATOR:
 * é a secretaria quem cria os perfis de motorista (POST /drivers) e os vínculos
 * responsável-aluno (POST /guardian-relations), e os dois pedem um `userId`/`guardianId` — sem
 * conseguir consultar a lista de usuários, a secretaria não teria como descobrir esse id.
 * Sem essa leitura, a matriz de permissões ficaria incoerente (dá pra criar o perfil, mas não
 * pra achar a conta que ele referencia).
 */
@ApiTags('Usuários (admin)')
@RespostaNaoAutenticado()
@RespostaSemPermissao()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @ApiOperation({
    summary: 'Cria um usuário com o papel escolhido',
    description:
      'Único jeito de criar DRIVER, OPERATOR ou ADMIN (o cadastro público só cria GUARDIAN). Só ADMIN.',
  })
  @ApiResponse({
    status: 201,
    description: 'Usuário criado.',
    schema: { example: EXEMPLO_USUARIO },
  })
  @RespostaCorpoInvalido()
  @RespostaConflito('Já existe um usuário com este e-mail.')
  @Roles(Role.ADMIN)
  @Post()
  criar(@Body() dto: CreateUserDto) {
    return this.users.criar(dto);
  }

  @ApiOperation({
    summary: 'Lista os usuários',
    description:
      'Paginado, sem filtros. ADMIN e OPERATOR (a secretaria precisa achar o id de um usuário ' +
      'para criar o perfil de motorista ou o vínculo responsável-aluno).',
  })
  @ApiResponse({
    status: 200,
    description: 'Página de usuários.',
    schema: {
      example: { data: [EXEMPLO_USUARIO], total: 1, page: 1, limit: 20 },
    },
  })
  @RespostaCorpoInvalido('Página ou limite fora do formato aceito.')
  @Roles(Role.OPERATOR, Role.ADMIN)
  @Get()
  listar(@Query() query: PaginationQueryDto) {
    return this.users.listar(query);
  }

  @ApiOperation({
    summary: 'Busca um usuário pelo id',
    description: 'ADMIN e OPERATOR.',
  })
  @ApiParam(ID_USUARIO)
  @ApiResponse({
    status: 200,
    description: 'O usuário.',
    schema: { example: EXEMPLO_USUARIO },
  })
  @RespostaCorpoInvalido('Id fora do formato UUID.')
  @RespostaNaoEncontrado('Nenhum usuário com este id.')
  @Roles(Role.OPERATOR, Role.ADMIN)
  @Get(':id')
  buscar(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.buscar(id);
  }

  @ApiOperation({
    summary: 'Altera um usuário',
    description:
      'Só ADMIN. Um ADMIN não pode desativar nem rebaixar a PRÓPRIA conta (409), para não se ' +
      'trancar fora do sistema.',
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
  @Roles(Role.ADMIN)
  @Patch(':id')
  atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() atual: AuthenticatedUser,
  ) {
    return this.users.atualizar(id, dto, atual);
  }

  @ApiOperation({
    summary: 'Desativa um usuário (soft delete)',
    description:
      'Equivalente a `PATCH /users/:id { active: false }` — o registro nunca é apagado, só ' +
      'desativado (mesma regra de negócio, mesmas restrições). Só ADMIN.',
  })
  @ApiParam(ID_USUARIO)
  @ApiResponse({
    status: 204,
    description: 'Usuário desativado (sem corpo na resposta).',
  })
  @RespostaCorpoInvalido('Id fora do formato UUID.')
  @RespostaNaoEncontrado('Nenhum usuário com este id.')
  @RespostaConflito(
    'Você tentou desativar a própria conta, OU este usuário conduz uma rota ativa no momento.',
  )
  @Roles(Role.ADMIN)
  @Delete(':id')
  @HttpCode(204)
  async excluir(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() atual: AuthenticatedUser,
  ): Promise<void> {
    await this.users.atualizar(id, { active: false }, atual);
  }
}
