import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Alteração do próprio perfil. Só o nome pode mudar (e-mail e papel não). */
export class UpdateMeDto {
  @ApiPropertyOptional({
    example: 'Ana Souza da Silva',
    minLength: 2,
    maxLength: 100,
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;
}
