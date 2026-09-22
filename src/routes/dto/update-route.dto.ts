import { ApiPropertyOptional } from '@nestjs/swagger';
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
 * Alteração parcial da rota. `vehicleId` e `driverId` aceitam `null` para RETIRAR o veículo ou o
 * motorista (proibido em rota ativa). O status não muda aqui: use /activate e /deactivate.
 */
export class UpdateRouteDto {
  @ApiPropertyOptional({
    example: 'Rota Centro (renomeada)',
    minLength: 2,
    maxLength: 80,
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ enum: Shift })
  @IsOptional()
  @IsEnum(Shift)
  shift?: Shift;

  @ApiPropertyOptional({
    description:
      'Novo veículo, ou `null` para retirar o atual (proibido em rota ativa).',
    example: '018f2f9e-2a3b-7c11-9f21-2b6b7e0a1234',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  vehicleId?: string | null;

  @ApiPropertyOptional({
    description:
      'Novo motorista, ou `null` para retirar o atual (proibido em rota ativa).',
    example: '018f2f9e-2a3b-7c11-9f21-2b6b7e0a1234',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  driverId?: string | null;
}
