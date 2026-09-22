import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { VehicleStatus } from '../../generated/prisma/client.js';

/** Listagem paginada de veículos, com filtro opcional por situação. */
export class ListVehiclesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: VehicleStatus,
    description: 'Filtra pela situação do veículo.',
  })
  @IsOptional()
  @IsEnum(VehicleStatus)
  status?: VehicleStatus;
}
