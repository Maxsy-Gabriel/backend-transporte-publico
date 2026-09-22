import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const aparar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Criação de um ponto da rota. Endereço e coordenadas vêm da consulta de CEP (serviço externo);
 * `street` e `neighborhood` só são necessários quando o CEP não os traz (CEP de cidade pequena).
 */
export class CreateStopDto {
  @ApiProperty({
    description:
      'CEP, com ou sem hífen (8 dígitos). Busca o endereço e as coordenadas na BrasilAPI.',
    example: '01001-000',
    pattern: '^\\d{5}-?\\d{3}$',
  })
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.trim().replace(/^(\d{5})-(\d{3})$/, '$1$2')
      : value,
  )
  @Matches(/^\d{8}$/, { message: 'cep deve ter 8 dígitos (com ou sem hífen)' })
  cep: string;

  @ApiProperty({
    description: 'Número do endereço ("S/N" quando não houver).',
    example: '10',
    maxLength: 10,
  })
  @Transform(aparar)
  @IsString()
  @MinLength(1)
  @MaxLength(10)
  number: string;

  @ApiPropertyOptional({
    description: 'Complemento do endereço.',
    example: 'Apto 12',
    maxLength: 60,
  })
  @IsOptional()
  @Transform(aparar)
  @IsString()
  @MaxLength(60)
  complement?: string;

  @ApiPropertyOptional({
    description: 'Nome de referência do ponto.',
    example: 'Em frente à padaria',
    maxLength: 60,
  })
  @IsOptional()
  @Transform(aparar)
  @IsString()
  @MaxLength(60)
  name?: string;

  @ApiPropertyOptional({
    description:
      'Logradouro. OBRIGATÓRIO só quando o CEP não traz essa informação (400 caso contrário).',
    example: 'Praça da Sé',
    minLength: 2,
    maxLength: 100,
  })
  @IsOptional()
  @Transform(aparar)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  street?: string;

  @ApiPropertyOptional({
    description:
      'Bairro. OBRIGATÓRIO só quando o CEP não traz essa informação (400 caso contrário).',
    example: 'Sé',
    minLength: 2,
    maxLength: 100,
  })
  @IsOptional()
  @Transform(aparar)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  neighborhood?: string;
}
