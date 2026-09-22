import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, ValidateIf } from 'class-validator';

/**
 * Coloca o aluno numa rota (com o ponto de embarque dele) ou o tira dela.
 *  - { routeId: "<uuid>", stopId: "<uuid>" } -> aloca (confere a capacidade do veículo);
 *  - { routeId: null } -> retira o aluno da rota (libera a vaga).
 */
export class AssignRouteDto {
  @ApiProperty({
    description: '`null` retira o aluno da rota; qualquer outra coisa precisa ser um UUID de uma rota existente.',
    example: '018f2f9e-2a3b-7c11-9f21-2b6b7e0a1234',
    nullable: true,
  })
  @ValidateIf((dto: AssignRouteDto) => dto.routeId !== null)
  @IsUUID()
  routeId: string | null;

  @ApiPropertyOptional({
    description: 'Ponto da rota onde o aluno embarca. Obrigatório quando `routeId` não é `null`.',
    example: '018f2f9e-2a3b-7c11-9f21-2b6b7e0a5678',
  })
  @ValidateIf((dto: AssignRouteDto) => dto.routeId !== null)
  @IsUUID()
  stopId?: string;
}
