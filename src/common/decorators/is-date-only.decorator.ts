import { applyDecorators } from '@nestjs/common';
import { IsISO8601, Matches } from 'class-validator';

/**
 * Data sem hora no formato AAAA-MM-DD que existe de verdade (rejeita, por exemplo, 2026-02-31).
 * Usada em datas de calendário: validade da CNH, nascimento do aluno.
 */
export const IsDateOnly = () =>
  applyDecorators(
    Matches(/^\d{4}-\d{2}-\d{2}$/, {
      message: '$property deve estar no formato AAAA-MM-DD',
    }),
    IsISO8601({ strict: true }, { message: '$property não é uma data válida' }),
  );
