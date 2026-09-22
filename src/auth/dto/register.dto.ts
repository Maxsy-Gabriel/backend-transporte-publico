import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Corpo do cadastro público de responsável. O papel NÃO é aceito aqui (o ValidationPipe
 * rejeita `role` com 400): quem se cadastra sozinho é sempre GUARDIAN.
 */
export class RegisterDto {
  @ApiProperty({
    description: 'Nome completo.',
    example: 'Ana Souza',
    minLength: 2,
    maxLength: 100,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiProperty({
    description: 'E-mail (normalizado para minúsculas; único no sistema).',
    example: 'ana.souza@example.com',
    maxLength: 254,
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({
    description:
      'Senha (mínimo 10 caracteres). Guardada só como hash (argon2id); nunca é devolvida.',
    example: 'uma-senha-bem-longa-123',
    minLength: 10,
    maxLength: 128,
  })
  @IsString()
  @MinLength(10, { message: 'password deve ter pelo menos 10 caracteres' })
  @MaxLength(128)
  password: string;
}
