import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/** Troca de senha do próprio usuário: exige a senha atual. */
export class ChangePasswordDto {
  @ApiProperty({
    description: 'Senha atual (confere antes de trocar).',
    example: 'uma-senha-bem-longa-123',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  currentPassword: string;

  @ApiProperty({
    description: 'Nova senha (mínimo 10 caracteres).',
    example: 'outra-senha-bem-longa-456',
    minLength: 10,
  })
  @IsString()
  @MinLength(10, { message: 'newPassword deve ter pelo menos 10 caracteres' })
  @MaxLength(128)
  newPassword: string;
}
