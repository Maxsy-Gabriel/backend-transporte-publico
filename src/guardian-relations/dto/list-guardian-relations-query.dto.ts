import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { GuardianRelationStatus } from '../../generated/prisma/client.js';

/** Listagem paginada de vínculos, com filtros opcionais por situação e por aluno. */
export class ListGuardianRelationsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(GuardianRelationStatus)
  status?: GuardianRelationStatus;

  @IsOptional()
  @IsUUID()
  studentId?: string;
}
