import { ApiResponse } from '@nestjs/swagger';
import { ErroPadraoDto } from './erro.dto.js';

/**
 * Atalhos para as respostas de erro que se repetem em quase toda rota, no formato real que a
 * API devolve (`ErroPadraoDto`). Cada um recebe uma descrição específica do caso, para o
 * Swagger explicar A REGRA, não só o código HTTP.
 */

/** 401: toda rota pode responder isso (X-API-KEY ausente/errada, ou, se a rota exige, token
 * ausente/inválido/expirado/assinado com outro segredo). */
export const RespostaNaoAutenticado = () =>
  ApiResponse({
    status: 401,
    description:
      'Cabeçalho X-API-KEY ausente ou inválido. Em rotas que também exigem login: token ' +
      'ausente, malformado, expirado, com assinatura inválida, ou do usuário desativado.',
    type: ErroPadraoDto,
  });

/** 403: autenticado, mas sem o papel exigido, ou mexendo num recurso que pertence a outra pessoa. */
export const RespostaSemPermissao = (detalhe?: string) =>
  ApiResponse({
    status: 403,
    description:
      detalhe ??
      'Autenticado, mas sem permissão: papel incompatível com esta rota, ou o recurso pertence a outra pessoa.',
    type: ErroPadraoDto,
  });

export const RespostaCorpoInvalido = (detalhe?: string) =>
  ApiResponse({
    status: 400,
    description:
      detalhe ??
      'Corpo, parâmetro de rota ou query inválidos: campo ausente, fora do formato esperado, ' +
        'tipo errado, ou campo não declarado no DTO.',
    type: ErroPadraoDto,
  });

export const RespostaNaoEncontrado = (detalhe: string) =>
  ApiResponse({ status: 404, description: detalhe, type: ErroPadraoDto });

export const RespostaConflito = (detalhe: string) =>
  ApiResponse({ status: 409, description: detalhe, type: ErroPadraoDto });
