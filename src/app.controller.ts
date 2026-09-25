import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from './auth/decorators/public.decorator.js';
import { RespostaNaoAutenticado } from './common/swagger/respostas.js';

const EXEMPLO_STATUS = {
  status: 'ok',
  service: 'API Transporte Escolar',
  message: 'O servidor está no ar.',
  docs: '/docs',
};

/**
 * Rota raiz: confirma que o servidor está de pé, com um link para a documentação
 * completa (Swagger). Dispensa o JWT (@Public), mas ainda exige X-API-KEY — a mesma
 * regra vale para toda rota da API, sem exceção (só /docs* fica fora do guard).
 */
@ApiTags('Status')
@RespostaNaoAutenticado()
@Controller()
export class AppController {
  @Public()
  @ApiOperation({
    summary: 'Confirma que a API está no ar',
    description:
      'Ponto de entrada da API. Aponta para a documentação completa em /docs.',
  })
  @ApiResponse({
    status: 200,
    description: 'Servidor no ar.',
    schema: { example: EXEMPLO_STATUS },
  })
  @Get()
  status() {
    return EXEMPLO_STATUS;
  }
}
