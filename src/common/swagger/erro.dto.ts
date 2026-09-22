import { ApiProperty } from '@nestjs/swagger';

/**
 * Corpo de erro do Nest: toda resposta 4xx/5xx da API tem este formato. `message` é um texto só
 * na maioria dos erros, e uma lista de textos (um por campo) quando é o ValidationPipe recusando
 * o corpo da requisição.
 */
export class ErroPadraoDto {
  @ApiProperty({
    example: 400,
    description: 'Repete o código HTTP da resposta.',
  })
  statusCode: number;

  @ApiProperty({
    description:
      'Descrição do problema, em português. Uma lista quando há mais de um campo inválido.',
    oneOf: [
      { type: 'string', example: 'Placa já cadastrada.' },
      {
        type: 'array',
        items: { type: 'string' },
        example: [
          'capacity deve ser um número inteiro',
          'model deve ter entre 2 e 60 caracteres',
        ],
      },
    ],
  })
  message: string | string[];

  @ApiProperty({
    example: 'Bad Request',
    description: 'Nome padrão do status HTTP (vem do Nest).',
  })
  error: string;
}
