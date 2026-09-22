import { IsUUID } from 'class-validator';

/** Registra o embarque de um aluno na viagem (o motorista informa quem subiu). */
export class BoardStudentDto {
  @IsUUID()
  studentId: string;
}
