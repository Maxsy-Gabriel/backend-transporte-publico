import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { GuardianRelationStatus } from '../../generated/prisma/client.js';

/** Listagem paginada de vínculos, com filtros opcionais por situação e por aluno. */
export class ListGuardianRelationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: GuardianRelationStatus,
    description: 'Filtra pela situação do vínculo.',
  })
  @IsOptional()
  @IsEnum(GuardianRelationStatus)
  status?: GuardianRelationStatus;

  @ApiPropertyOptional({
    description: 'Filtra pelos vínculos deste aluno.',
    example: '018f2f9e-2a3b-7c11-9f21-2b6b7e0a5678',
  })
  @IsOptional()
  @IsUUID()
  studentId?: string;
}
