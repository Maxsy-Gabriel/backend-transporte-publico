import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';
import { Relationship } from '../../generated/prisma/client.js';

/**
 * A secretaria liga um responsável (usuário GUARDIAN) a um aluno. O vínculo nasce PENDENTE: só
 * dá acesso aos dados do aluno depois de o responsável enviar o documento e a secretaria aprovar.
 */
export class CreateGuardianRelationDto {
  @ApiProperty({
    description: 'Id de um usuário existente com o papel GUARDIAN e ativo.',
    example: '018f2f9e-2a3b-7c11-9f21-2b6b7e0a1234',
  })
  @IsUUID()
  guardianId: string;

  @ApiProperty({
    description: 'Id de um aluno existente.',
    example: '018f2f9e-2a3b-7c11-9f21-2b6b7e0a5678',
  })
  @IsUUID()
  studentId: string;

  @ApiProperty({
    enum: Relationship,
    description: 'Parentesco/relação com o aluno.',
    example: Relationship.MOTHER,
  })
  @IsEnum(Relationship)
  relationship: Relationship;
}
