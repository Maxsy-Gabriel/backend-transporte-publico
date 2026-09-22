import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** Rejeitar exige o motivo, que o responsável vai precisar ler para corrigir o documento. */
export class RejectGuardianRelationDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason: string;
}
