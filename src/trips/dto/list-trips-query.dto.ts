import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { IsDateOnly } from '../../common/decorators/is-date-only.decorator.js';
import { TripStatus } from '../../generated/prisma/client.js';

/**
 * Listagem paginada de viagens, com filtros opcionais por situação, por rota e por período
 * (`from`/`to`, AAAA-MM-DD, inclusivos, comparados em UTC). Os dois são opcionais e
 * independentes: só `from` filtra "a partir de"; só `to` filtra "até".
 */
export class ListTripsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(TripStatus)
  status?: TripStatus;

  @IsOptional()
  @IsUUID()
  routeId?: string;

  @IsOptional()
  @IsDateOnly()
  from?: string;

  @IsOptional()
  @IsDateOnly()
  to?: string;
}
