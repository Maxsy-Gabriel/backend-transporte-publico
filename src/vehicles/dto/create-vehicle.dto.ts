import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { VehicleStatus } from '../../generated/prisma/client.js';

export class CreateVehicleDto {
  @ApiProperty({
    description:
      'Placa do veículo. Aceita "ABC-1234" ou "ABC1D23" (Mercosul), com ou sem hífen/espaço; ' +
      'é guardada normalizada (maiúsculas, sem hífen nem espaços).',
    example: 'ABC1D23',
    pattern: '^[A-Z]{3}[0-9][0-9A-Z][0-9]{2}$',
  })
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.replace(/[\s-]/g, '').toUpperCase()
      : value,
  )
  @Matches(/^[A-Z]{3}[0-9][0-9A-Z][0-9]{2}$/, {
    message: 'plate deve estar no formato AAA1234 ou AAA1A23 (Mercosul)',
  })
  plate: string;

  @ApiProperty({
    description: 'Modelo/nome do veículo.',
    example: 'Van Escolar',
    minLength: 2,
    maxLength: 60,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  model: string;

  @ApiProperty({
    description:
      'Número de lugares para alunos. Define a capacidade máxima das rotas deste veículo.',
    example: 15,
    minimum: 1,
    maximum: 100,
  })
  @IsInt()
  @Min(1)
  @Max(100)
  capacity: number;

  @ApiPropertyOptional({
    enum: VehicleStatus,
    default: VehicleStatus.ACTIVE,
    description: 'Situação do veículo. Se omitido, nasce ACTIVE.',
  })
  @IsOptional()
  @IsEnum(VehicleStatus)
  status?: VehicleStatus;
}
