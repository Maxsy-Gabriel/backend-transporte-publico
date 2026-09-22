import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Shift } from '../../generated/prisma/client.js';

/**
 * Criação de rota. Ela sempre nasce em rascunho (DRAFT): o status não é aceito aqui, e só o
 * endpoint de ativação a coloca em operação.
 */
export class CreateRouteDto {
  @ApiProperty({
    description: 'Nome da rota. Único por turno.',
    example: 'Rota Centro',
    minLength: 2,
    maxLength: 80,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @ApiProperty({
    enum: Shift,
    description: 'Turno da rota.',
    example: Shift.MORNING,
  })
  @IsEnum(Shift)
  shift: Shift;

  @ApiPropertyOptional({
    description:
      'Id de um veículo ACTIVE (opcional; sem ele a rota não pode ser ativada).',
    example: '018f2f9e-2a3b-7c11-9f21-2b6b7e0a1234',
  })
  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @ApiPropertyOptional({
    description:
      'Id de um motorista ativo com CNH válida (opcional; sem ele a rota não pode ser ativada).',
    example: '018f2f9e-2a3b-7c11-9f21-2b6b7e0a1234',
  })
  @IsOptional()
  @IsUUID()
  driverId?: string;
}
