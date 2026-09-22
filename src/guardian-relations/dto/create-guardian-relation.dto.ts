import { IsEnum, IsUUID } from 'class-validator';
import { Relationship } from '../../generated/prisma/client.js';

/**
 * A secretaria liga um responsável (usuário GUARDIAN) a um aluno. O vínculo nasce PENDENTE: só
 * dá acesso aos dados do aluno depois de o responsável enviar o documento e a secretaria aprovar.
 */
export class CreateGuardianRelationDto {
  @IsUUID()
  guardianId: string;

  @IsUUID()
  studentId: string;

  @IsEnum(Relationship)
  relationship: Relationship;
}
