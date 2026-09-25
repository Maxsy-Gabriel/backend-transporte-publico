import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  RespostaCorpoInvalido,
  RespostaConflito,
  RespostaNaoAutenticado,
} from '../common/swagger/respostas.js';
import { Public } from './decorators/public.decorator.js';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';

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
 * Rotas públicas (sem JWT — `@Public()`). A API key continua exigida, como em toda rota; por
 * isso mesmo aqui só o 401 dela é documentado, nunca 403 (não há papel a exigir).
 */
@ApiTags('Autenticação')
@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @ApiOperation({
    summary: 'Cadastra um responsável (GUARDIAN)',
    description:
      'Cadastro público. O papel nasce sempre GUARDIAN — enviar "role" no corpo é rejeitado ' +
      '(400), mesmo que o valor seja válido. Motoristas, secretaria e admins são criados por ' +
      'um ADMIN em POST /users.',
  })
  @ApiResponse({
    status: 201,
    description: 'Usuário criado (sem o hash da senha).',
    schema: { example: EXEMPLO_USUARIO },
  })
  @RespostaCorpoInvalido()
  @RespostaConflito('Já existe um usuário com este e-mail.')
  @RespostaNaoAutenticado()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @ApiOperation({
    summary: 'Login',
    description:
      'Confere e-mail e senha e devolve um JWT (Bearer). E-mail inexistente, senha errada e ' +
      'usuário desativado respondem TODOS com a mesma mensagem e em tempo parecido, de ' +
      'propósito — para não revelar quais e-mails existem no sistema.',
  })
  @ApiResponse({
    status: 200,
    description: 'Login feito.',
    schema: {
      example: {
        accessToken: 'eyJhbGciOiJIUzI1NiIs...',
        tokenType: 'Bearer',
        expiresIn: '15m',
      },
    },
  })
  @RespostaCorpoInvalido()
  @ApiResponse({
    status: 401,
    description:
      'X-API-KEY ausente/inválida, OU credenciais inválidas (e-mail, senha ou usuário desativado).',
    schema: {
      example: {
        statusCode: 401,
        message: 'Credenciais inválidas.',
        error: 'Unauthorized',
      },
    },
  })
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }
}
