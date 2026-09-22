import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { RegisterDto } from '../../auth/dto/register.dto.js';
import { Role } from '../../generated/prisma/client.js';

/**
 * Criação de usuário pelo ADMIN: mesmos campos do cadastro público, mais o papel.
 * É assim que nascem motoristas, operadores e outros administradores.
 */
export class CreateUserDto extends RegisterDto {
  @ApiProperty({
    enum: Role,
    description:
      'Papel do usuário. Para DRIVER, ainda falta criar o perfil em POST /drivers.',
    example: Role.DRIVER,
  })
  @IsEnum(Role)
  role: Role;
}
