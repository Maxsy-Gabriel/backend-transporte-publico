import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Corpo do login. O e-mail é normalizado como no cadastro. */
export class LoginDto {
  @ApiProperty({ example: 'ana.souza@example.com' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({
    description: 'A senha cadastrada.',
    example: 'uma-senha-bem-longa-123',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;
}
