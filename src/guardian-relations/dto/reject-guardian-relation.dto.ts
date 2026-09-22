import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** Rejeitar exige o motivo, que o responsável vai precisar ler para corrigir o documento. */
export class RejectGuardianRelationDto {
  @ApiProperty({
    description:
      'Motivo da rejeição, visível ao responsável (para ele corrigir e reenviar o documento).',
    example:
      'Foto cortada: envie o documento inteiro, com as quatro bordas visíveis.',
    minLength: 3,
    maxLength: 300,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason: string;
}
