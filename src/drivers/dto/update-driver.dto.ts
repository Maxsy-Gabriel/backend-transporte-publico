import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, Matches } from 'class-validator';
import { IsDateOnly } from '../../common/decorators/is-date-only.decorator.js';

/** Alteração parcial do motorista. O usuário vinculado não muda. */
export class UpdateDriverDto {
  @ApiPropertyOptional({
    description: 'Novo número da CNH (único).',
    example: 'CD987654321',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^[A-Z0-9]{5,20}$/, {
    message: 'licenseNumber deve ter de 5 a 20 letras ou números',
  })
  licenseNumber?: string;

  @ApiPropertyOptional({
    description: 'Nova validade da CNH (AAAA-MM-DD).',
    example: '2030-06-30',
  })
  @IsOptional()
  @IsDateOnly()
  licenseExpiresAt?: string;

  @ApiPropertyOptional({
    description:
      'Ativa/desativa o perfil. Desativar (ou deixar a CNH vencer) é recusado (409) se o ' +
      'motorista conduz uma rota ativa no momento.',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
