import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

/** Listagem paginada de alunos, com busca por nome/matrícula e filtro por rota. */
export class ListStudentsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Trecho do nome ou da matrícula (sem diferenciar maiúsculas).',
    example: 'ana',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({
    description: 'Filtra pelos alunos alocados nesta rota.',
    example: '018f2f9e-2a3b-7c11-9f21-2b6b7e0a1234',
  })
  @IsOptional()
  @IsUUID()
  routeId?: string;
}
