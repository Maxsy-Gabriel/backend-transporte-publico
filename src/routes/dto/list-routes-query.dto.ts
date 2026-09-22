import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { RouteStatus, Shift } from '../../generated/prisma/client.js';

/** Listagem paginada de rotas, com filtros opcionais por situação e turno. */
export class ListRoutesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: RouteStatus,
    description: 'Filtra pela situação da rota.',
  })
  @IsOptional()
  @IsEnum(RouteStatus)
  status?: RouteStatus;

  @ApiPropertyOptional({ enum: Shift, description: 'Filtra pelo turno.' })
  @IsOptional()
  @IsEnum(Shift)
  shift?: Shift;
}
