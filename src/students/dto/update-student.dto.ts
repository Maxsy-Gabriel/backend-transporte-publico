import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { IsDateOnly } from '../../common/decorators/is-date-only.decorator.js';

const aparar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Alteração parcial do aluno. Desativar (`active: false`) também tira o aluno da rota, o que
 * libera a vaga. A rota nunca é alterada aqui.
 */
export class UpdateStudentDto {
  @ApiPropertyOptional({ example: 'Ana Souza da Silva', minLength: 2, maxLength: 100 })
  @IsOptional()
  @Transform(aparar)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: '2016-03-20' })
  @IsOptional()
  @IsDateOnly()
  birthDate?: string;

  @ApiPropertyOptional({ description: 'Nova matrícula (única).', example: 'MAT-2026-002' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z0-9][A-Z0-9._-]{2,29}$/, {
    message:
      'registrationNumber deve ter de 3 a 30 caracteres (letras, números, ponto, hífen ou sublinhado)',
  })
  registrationNumber?: string;

  @ApiPropertyOptional({ example: 'Escola Municipal Centro', minLength: 2, maxLength: 100 })
  @IsOptional()
  @Transform(aparar)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  schoolName?: string;

  @ApiPropertyOptional({
    description: 'Ativa/desativa o aluno. Desativar tira ele da rota (libera a vaga); recusado (409) se estiver a bordo.',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
