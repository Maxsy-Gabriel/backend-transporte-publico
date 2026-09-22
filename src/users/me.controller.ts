import { Body, Controller, Get, HttpCode, Patch } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import {
  RespostaCorpoInvalido,
  RespostaNaoAutenticado,
} from '../common/swagger/respostas.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { UpdateMeDto } from './dto/update-me.dto.js';
import { UsersService } from './users.service.js';

const EXEMPLO_USUARIO = {
  id: '018f2f9e-2a3b-7c11-9f21-2b6b7e0a1234',
  name: 'Ana Souza',
  email: 'ana.souza@example.com',
  role: 'GUARDIAN',
  active: true,
  createdAt: '2026-09-21T12:00:00.000Z',
  updatedAt: '2026-09-21T12:00:00.000Z',
};

/**
 * Operações do próprio usuário autenticado — QUALQUER papel (não há `@Roles` aqui: sem essa
 * decoração, a regra é "basta estar autenticado"). Nunca há 403 nestas rotas.
 */
@ApiTags('Meu perfil')
@RespostaNaoAutenticado()
@Controller('me')
export class MeController {
  constructor(private readonly users: UsersService) {}

  @ApiOperation({
    summary: 'Meu perfil',
    description:
      'O id vem do TOKEN, nunca de um parâmetro — não existe /me/:id.',
  })
  @ApiResponse({
    status: 200,
    description: 'O usuário autenticado.',
    schema: { example: EXEMPLO_USUARIO },
  })
  @Get()
  perfil(@CurrentUser() usuario: AuthenticatedUser) {
    return this.users.perfil(usuario.id);
  }

  @ApiOperation({
    summary: 'Altera meu perfil',
    description: 'Só o nome pode mudar (e-mail e papel, não).',
  })
  @ApiResponse({
    status: 200,
    description: 'Perfil atualizado.',
    schema: { example: EXEMPLO_USUARIO },
  })
  @RespostaCorpoInvalido()
  @Patch()
  atualizar(
    @CurrentUser() usuario: AuthenticatedUser,
    @Body() dto: UpdateMeDto,
  ) {
    return this.users.atualizarPerfil(usuario.id, dto);
  }

  @ApiOperation({
    summary: 'Troca minha senha',
    description:
      'Exige a senha atual; a nova precisa ter pelo menos 10 caracteres.',
  })
  @ApiResponse({
    status: 204,
    description: 'Senha trocada (sem corpo na resposta).',
  })
  @RespostaCorpoInvalido(
    'Senha atual incorreta, ou a nova senha fora do formato exigido.',
  )
  @Patch('password')
  @HttpCode(204)
  async alterarSenha(
    @CurrentUser() usuario: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.users.alterarSenha(usuario.id, dto);
  }
}
