import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import {
  RespostaCorpoInvalido,
  RespostaConflito,
  RespostaNaoAutenticado,
  RespostaNaoEncontrado,
  RespostaSemPermissao,
} from '../common/swagger/respostas.js';
import { Role } from '../generated/prisma/client.js';
import { CreateDriverDto } from './dto/create-driver.dto.js';
import { UpdateDriverDto } from './dto/update-driver.dto.js';
import { DriversService } from './drivers.service.js';

const ID_MOTORISTA = {
  name: 'id',
  description: 'Id do perfil de motorista (UUID).',
  example: '018f2f9e-2a3b-7c11-9f21-2b6b7e0a1234',
};
const EXEMPLO_MOTORISTA = {
  id: '018f2f9e-2a3b-7c11-9f21-2b6b7e0a1234',
  licenseNumber: 'AB123456789',
  licenseExpiresAt: '2029-12-31',
  active: true,
  createdAt: '2026-09-21T12:00:00.000Z',
  updatedAt: '2026-09-21T12:00:00.000Z',
  user: {
    id: '018f2f9e-...',
    name: 'João Motorista',
    email: 'joao@example.com',
  },
};

/** Gestão de motoristas: somente a secretaria (OPERATOR) e o ADMIN. */
@ApiTags('Motoristas')
@RespostaNaoAutenticado()
@RespostaSemPermissao()
@Roles(Role.OPERATOR, Role.ADMIN)
@Controller('drivers')
export class DriversController {
  constructor(private readonly drivers: DriversService) {}

  @ApiOperation({
    summary: 'Cria o perfil de motorista',
    description:
      'O usuário informado precisa já existir e ter o papel DRIVER, e ainda não ter perfil.',
  })
  @ApiResponse({
    status: 201,
    description: 'Perfil criado.',
    schema: { example: EXEMPLO_MOTORISTA },
  })
  @RespostaCorpoInvalido()
  @RespostaNaoEncontrado('Nenhum usuário com este userId.')
  @RespostaConflito(
    'O usuário não tem o papel DRIVER, já tem perfil, OU a CNH já está em uso por outro motorista.',
  )
  @Post()
  criar(@Body() dto: CreateDriverDto) {
    return this.drivers.criar(dto);
  }

  @ApiOperation({
    summary: 'Lista os motoristas',
    description: 'Paginado, sem filtros.',
  })
  @ApiResponse({
    status: 200,
    description: 'Página de motoristas.',
    schema: {
      example: { data: [EXEMPLO_MOTORISTA], total: 1, page: 1, limit: 20 },
    },
  })
  @RespostaCorpoInvalido('Página ou limite fora do formato aceito.')
  @Get()
  listar(@Query() query: PaginationQueryDto) {
    return this.drivers.listar(query);
  }

  @ApiOperation({ summary: 'Busca um motorista pelo id' })
  @ApiParam(ID_MOTORISTA)
  @ApiResponse({
    status: 200,
    description: 'O motorista.',
    schema: { example: EXEMPLO_MOTORISTA },
  })
  @RespostaCorpoInvalido('Id fora do formato UUID.')
  @RespostaNaoEncontrado('Nenhum motorista com este id.')
  @Get(':id')
  buscar(@Param('id', ParseUUIDPipe) id: string) {
    return this.drivers.buscar(id);
  }

  @ApiOperation({
    summary: 'Altera um motorista',
    description: 'Alteração parcial (envie só os campos que quer mudar).',
  })
  @ApiParam(ID_MOTORISTA)
  @ApiResponse({
    status: 200,
    description: 'Motorista atualizado.',
    schema: { example: EXEMPLO_MOTORISTA },
  })
  @RespostaCorpoInvalido()
  @RespostaNaoEncontrado('Nenhum motorista com este id.')
  @RespostaConflito(
    'Nova CNH já usada por outro motorista, OU este motorista conduz uma rota ativa e a ' +
      'alteração o deixaria inapto (desativado ou CNH vencida).',
  )
  @Patch(':id')
  atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDriverDto,
  ) {
    return this.drivers.atualizar(id, dto);
  }

  @ApiOperation({
    summary: 'Rotas conduzidas por este motorista',
    description: 'Consulta por relacionamento.',
  })
  @ApiParam(ID_MOTORISTA)
  @ApiResponse({
    status: 200,
    description: 'Lista de rotas (pode ser vazia).',
    schema: {
      example: [
        {
          id: '018f...',
          name: 'Rota Centro',
          shift: 'MORNING',
          status: 'ACTIVE',
        },
      ],
    },
  })
  @RespostaNaoEncontrado('Nenhum motorista com este id.')
  @Get(':id/routes')
  rotas(@Param('id', ParseUUIDPipe) id: string) {
    return this.drivers.rotas(id);
  }
}
