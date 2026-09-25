import { ApiResponse } from '@nestjs/swagger';

/**
 * Atalhos para as respostas de erro que se repetem em quase toda rota, no formato real que a
 * API devolve (mesmas 3 chaves de `ErroPadraoDto`: `statusCode`, `message`, `error`).
 *
 * IMPORTANTE: aqui NÃO se usa `type: ErroPadraoDto`. Passar `type` faz o Swagger montar
 * `content['application/json'].schema` como `{ $ref: ErroPadraoDto }` e IGNORA qualquer
 * `schema.example` dado ao lado — toda rota que referencia a mesma classe acaba mostrando,
 * no Swagger UI, o Único exemplo fixo gravado nos `@ApiProperty` da classe (sempre
 * `statusCode: 400`), em QUALQUER código HTTP. Foi um bug real do projeto, encontrado direto
 * no `/docs` renderizado. Por isso cada resposta abaixo recebe seu PRÓPRIO `schema.example`,
 * sem `type` — o mesmo jeito que já é usado (corretamente) em toda resposta de sucesso deste
 * projeto. `ErroPadraoDto` continua documentado no Swagger via `extraModels` (ver swagger.ts),
 * só não é mais referenciado por `$ref` nestas respostas específicas.
 */

const erro = (
  statusCode: number,
  error: string,
  message: string | string[],
) => ({
  schema: { example: { statusCode, message, error } },
});

/** 401: toda rota pode responder isso (X-API-KEY ausente/errada, ou, se a rota exige, token
 * ausente/inválido/expirado/assinado com outro segredo). */
export const RespostaNaoAutenticado = () =>
  ApiResponse({
    status: 401,
    description:
      'Cabeçalho X-API-KEY ausente ou inválido. Em rotas que também exigem login: token ' +
      'ausente, malformado, expirado, com assinatura inválida, ou do usuário desativado.',
    ...erro(401, 'Unauthorized', 'API key ausente ou inválida.'),
  });

/** 403: autenticado, mas sem o papel exigido, ou mexendo num recurso que pertence a outra pessoa. */
export const RespostaSemPermissao = (detalhe?: string) => {
  const mensagem =
    detalhe ?? 'Você não tem permissão para realizar esta operação.';
  return ApiResponse({
    status: 403,
    description:
      detalhe ??
      'Autenticado, mas sem permissão: papel incompatível com esta rota, ou o recurso pertence a outra pessoa.',
    ...erro(403, 'Forbidden', mensagem),
  });
};

export const RespostaCorpoInvalido = (detalhe?: string) => {
  const mensagem: string | string[] = detalhe ?? [
    'nome do campo deve respeitar o tipo, formato e limites definidos no DTO',
  ];
  return ApiResponse({
    status: 400,
    description:
      detalhe ??
      'Corpo, parâmetro de rota ou query inválidos: campo ausente, fora do formato esperado, ' +
        'tipo errado, ou campo não declarado no DTO.',
    ...erro(400, 'Bad Request', mensagem),
  });
};

export const RespostaNaoEncontrado = (detalhe: string) =>
  ApiResponse({
    status: 404,
    description: detalhe,
    ...erro(404, 'Not Found', detalhe),
  });

export const RespostaConflito = (detalhe: string) =>
  ApiResponse({
    status: 409,
    description: detalhe,
    ...erro(409, 'Conflict', detalhe),
  });
