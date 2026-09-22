import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { VehicleStatus } from '../../generated/prisma/client.js';

/** Alteração parcial. A placa não muda (é a identidade do veículo). */
export class UpdateVehicleDto {
  @ApiPropertyOptional({
    description: 'Modelo/nome do veículo.',
    example: 'Micro-ônibus',
    minLength: 2,
    maxLength: 60,
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  model?: string;

  @ApiPropertyOptional({
    description:
      'Nova capacidade. Recusada (409) se ficar menor que os alunos já alocados nas rotas deste veículo.',
    example: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  capacity?: number;

  @ApiPropertyOptional({
    enum: VehicleStatus,
    description:
      'Nova situação. Tirar de ACTIVE é recusado (409) se o veículo conduz uma rota ativa no momento.',
  })
  @IsOptional()
  @IsEnum(VehicleStatus)
  status?: VehicleStatus;
}
