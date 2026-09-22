import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsUUID, Matches } from 'class-validator';
import { IsDateOnly } from '../../common/decorators/is-date-only.decorator.js';

/** Cria o perfil de motorista de um usuário que já existe e tem o papel DRIVER. */
export class CreateDriverDto {
  @ApiProperty({
    description:
      'Id de um usuário existente com o papel DRIVER (criado antes, em POST /users).',
    example: '018f2f9e-2a3b-7c11-9f21-2b6b7e0a1234',
  })
  @IsUUID()
  userId: string;

  @ApiProperty({
    description:
      'Número da CNH: 5 a 20 letras ou números (normalizado em maiúsculas). Único no sistema.',
    example: 'AB123456789',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^[A-Z0-9]{5,20}$/, {
    message: 'licenseNumber deve ter de 5 a 20 letras ou números',
  })
  licenseNumber: string;

  @ApiProperty({
    description:
      'Validade da CNH (AAAA-MM-DD). Vencida, o motorista não pode conduzir rota ativa nem iniciar viagem.',
    example: '2029-12-31',
  })
  @IsDateOnly()
  licenseExpiresAt: string;
}
