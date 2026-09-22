import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { CepService } from './cep.service.js';

/** Integrações com serviços externos (consulta de CEP e geocodificação). */
@Module({
  imports: [HttpModule],
  providers: [CepService],
  exports: [CepService],
})
export class GeoModule {}
