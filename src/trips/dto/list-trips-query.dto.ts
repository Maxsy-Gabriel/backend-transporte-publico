import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { IsDateOnly } from '../../common/decorators/is-date-only.decorator.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { TripStatus } from '../../generated/prisma/client.js';

/**
 * Listagem paginada de viagens, com filtros opcionais por situação, por rota e por período
 * (`from`/`to`, AAAA-MM-DD, inclusivos, comparados em UTC). Os dois são opcionais e
 * independentes: só `from` filtra "a partir de"; só `to` filtra "até".
 */
export class ListTripsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: TripStatus,
    description: 'Filtra pela situação da viagem.',
  })
  @IsOptional()
  @IsEnum(TripStatus)
  status?: TripStatus;

  @ApiPropertyOptional({
    description: 'Filtra pelas viagens desta rota.',
    example: '018f2f9e-2a3b-7c11-9f21-2b6b7e0a1234',
  })
  @IsOptional()
  @IsUUID()
  routeId?: string;

  @ApiPropertyOptional({
    description: 'A partir deste dia (inclusive), AAAA-MM-DD, em UTC.',
    example: '2026-09-01',
  })
  @IsOptional()
  @IsDateOnly()
  from?: string;

  @ApiPropertyOptional({
    description: 'Até este dia (inclusive), AAAA-MM-DD, em UTC.',
    example: '2026-09-30',
  })
  @IsOptional()
  @IsDateOnly()
  to?: string;
}
