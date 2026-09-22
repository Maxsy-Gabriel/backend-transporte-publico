import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/**
 * Módulo global: o PrismaService fica disponível para todos os módulos sem precisar
 * importar o PrismaModule em cada um (um único client e um único pool por processo).
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
