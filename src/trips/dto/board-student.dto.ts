import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/** Registra o embarque de um aluno na viagem (o motorista informa quem subiu). */
export class BoardStudentDto {
  @ApiProperty({
    description: 'Id de um aluno ativo, alocado NESTA rota.',
    example: '018f2f9e-2a3b-7c11-9f21-2b6b7e0a5678',
  })
  @IsUUID()
  studentId: string;
}
