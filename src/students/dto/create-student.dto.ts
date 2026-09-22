import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { IsDateOnly } from '../../common/decorators/is-date-only.decorator.js';

const aparar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Cadastro de aluno. A rota e o ponto NÃO entram aqui: o aluno só é colocado numa rota pelo
 * endpoint próprio (PATCH /students/:id/route), que confere a capacidade do veículo.
 */
export class CreateStudentDto {
  @ApiProperty({ example: 'Ana Souza', minLength: 2, maxLength: 100 })
  @Transform(aparar)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiProperty({ description: 'Data de nascimento (AAAA-MM-DD); não pode ser futura.', example: '2016-03-20' })
  @IsDateOnly()
  birthDate: string;

  @ApiProperty({
    description: 'Matrícula escolar (única). Guardada em maiúsculas.',
    example: 'MAT-2026-001',
    pattern: '^[A-Z0-9][A-Z0-9._-]{2,29}$',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z0-9][A-Z0-9._-]{2,29}$/, {
    message:
      'registrationNumber deve ter de 3 a 30 caracteres (letras, números, ponto, hífen ou sublinhado)',
  })
  registrationNumber: string;

  @ApiProperty({ example: 'Escola Municipal Centro', minLength: 2, maxLength: 100 })
  @Transform(aparar)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  schoolName: string;
}
