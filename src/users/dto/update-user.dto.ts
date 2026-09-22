import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Role } from '../../generated/prisma/client.js';

/** Alteração de usuário pelo ADMIN (campos opcionais). Desativar é `active: false`; não há exclusão. */
export class UpdateUserDto {
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

  @ApiPropertyOptional({
    enum: Role,
    description:
      'Novo papel. Um ADMIN não pode trocar o PRÓPRIO papel (409), para não se trancar fora do sistema.',
  })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({
    description:
      'Ativa/desativa a conta. Desativar a PRÓPRIA conta é recusado (409), assim como desativar ' +
      'quem conduz uma rota ativa no momento.',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
