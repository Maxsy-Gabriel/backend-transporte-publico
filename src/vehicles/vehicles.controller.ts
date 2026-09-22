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
import {
  RespostaCorpoInvalido,
  RespostaConflito,
  RespostaNaoAutenticado,
  RespostaNaoEncontrado,
  RespostaSemPermissao,
} from '../common/swagger/respostas.js';
import { Role } from '../generated/prisma/client.js';
import { CreateVehicleDto } from './dto/create-vehicle.dto.js';
import { ListVehiclesQueryDto } from './dto/list-vehicles-query.dto.js';
import { UpdateVehicleDto } from './dto/update-vehicle.dto.js';
import { VehiclesService } from './vehicles.service.js';

const ID_VEICULO = {
  name: 'id',
  description: 'Id do veículo (UUID).',
  example: '018f2f9e-2a3b-7c11-9f21-2b6b7e0a1234',
};
const EXEMPLO_VEICULO = {
  id: '018f2f9e-2a3b-7c11-9f21-2b6b7e0a1234',
  plate: 'ABC1D23',
  model: 'Van Escolar',
  capacity: 15,
  status: 'ACTIVE',
  createdAt: '2026-09-21T12:00:00.000Z',
  updatedAt: '2026-09-21T12:00:00.000Z',
};

/** Gestão de veículos: somente a secretaria (OPERATOR) e o ADMIN. */
@ApiTags('Veículos')
@RespostaNaoAutenticado()
@RespostaSemPermissao()
@Roles(Role.OPERATOR, Role.ADMIN)
@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @ApiOperation({
    summary: 'Cadastra um veículo',
    description:
      'A placa aceita "ABC-1234" ou "ABC1D23" (Mercosul) e é guardada normalizada ' +
      '(maiúsculas, sem hífen/espaço). Nasce com status ACTIVE.',
  })
  @ApiResponse({
    status: 201,
    description: 'Veículo criado.',
    schema: { example: EXEMPLO_VEICULO },
  })
  @RespostaCorpoInvalido()
  @RespostaConflito(
    'Já existe um veículo com esta placa (comparada já normalizada).',
  )
  @Post()
  criar(@Body() dto: CreateVehicleDto) {
    return this.vehicles.criar(dto);
  }

  @ApiOperation({
    summary: 'Lista os veículos',
    description: 'Paginado; filtra opcionalmente por situação.',
  })
  @ApiResponse({
    status: 200,
    description: 'Página de veículos.',
    schema: {
      example: { data: [EXEMPLO_VEICULO], total: 1, page: 1, limit: 20 },
    },
  })
  @RespostaCorpoInvalido('Página, limite ou situação fora do formato aceito.')
  @Get()
  listar(@Query() query: ListVehiclesQueryDto) {
    return this.vehicles.listar(query);
  }

  @ApiOperation({ summary: 'Busca um veículo pelo id' })
  @ApiParam(ID_VEICULO)
  @ApiResponse({
    status: 200,
    description: 'O veículo.',
    schema: { example: EXEMPLO_VEICULO },
  })
  @RespostaCorpoInvalido('Id fora do formato UUID.')
  @RespostaNaoEncontrado('Nenhum veículo com este id.')
  @Get(':id')
  buscar(@Param('id', ParseUUIDPipe) id: string) {
    return this.vehicles.buscar(id);
  }

  @ApiOperation({
    summary: 'Altera um veículo',
    description:
      'Alteração parcial (envie só os campos que quer mudar). A placa NÃO pode ser alterada ' +
      '(é a identidade do veículo) — enviá-la no corpo dá 400.',
  })
  @ApiParam(ID_VEICULO)
  @ApiResponse({
    status: 200,
    description: 'Veículo atualizado.',
    schema: { example: EXEMPLO_VEICULO },
  })
  @RespostaCorpoInvalido()
  @RespostaNaoEncontrado('Nenhum veículo com este id.')
  @RespostaConflito(
    'A nova capacidade é menor que os alunos já alocados nas rotas deste veículo, OU o ' +
      'veículo está sendo tirado de ACTIVE enquanto conduz uma rota ativa.',
  )
  @Patch(':id')
  atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVehicleDto,
  ) {
    return this.vehicles.atualizar(id, dto);
  }

  @ApiOperation({
    summary: 'Rotas que usam este veículo',
    description:
      'Consulta por relacionamento: toda rota (de qualquer situação) associada a este veículo.',
  })
  @ApiParam(ID_VEICULO)
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
  @RespostaNaoEncontrado('Nenhum veículo com este id.')
  @Get(':id/routes')
  rotas(@Param('id', ParseUUIDPipe) id: string) {
    return this.vehicles.rotas(id);
  }
}
