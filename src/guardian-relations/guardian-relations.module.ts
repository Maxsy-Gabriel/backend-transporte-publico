import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { GuardianRelationsController } from './guardian-relations.controller.js';
import { GuardianRelationsService } from './guardian-relations.service.js';

@Module({
  imports: [
    // Limites do upload, lidos do ambiente. Sem `storage`, o multer guarda o arquivo em MEMÓRIA:
    // ele só é gravado em disco (com nome gerado) depois de validado, então um arquivo recusado
    // nunca toca o disco. Os navegadores enviam o nome do arquivo em UTF-8 (o padrão do multer
    // é latin1 e deformaria os acentos).
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        defParamCharset: 'utf8',
        limits: {
          fileSize: config.getOrThrow('UPLOAD_MAX_BYTES', { infer: true }),
          files: 1,
          fields: 5,
        },
      }),
    }),
  ],
  controllers: [GuardianRelationsController],
  providers: [GuardianRelationsService],
})
export class GuardianRelationsModule {}
