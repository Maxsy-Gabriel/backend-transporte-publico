import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { ApiKeyGuard } from './auth/guards/api-key.guard.js';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard.js';
import { RolesGuard } from './auth/guards/roles.guard.js';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter.js';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.js';
import { validate } from './config/env.validation.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { VehiclesModule } from './vehicles/vehicles.module.js';
import { DriversModule } from './drivers/drivers.module.js';
import { GeoModule } from './geo/geo.module.js';
import { RoutesModule } from './routes/routes.module.js';
import { StudentsModule } from './students/students.module.js';
import { GuardianRelationsModule } from './guardian-relations/guardian-relations.module.js';
import { TripsModule } from './trips/trips.module.js';

@Module({
  imports: [
    // Configuração global (ConfigService em qualquer módulo). Os valores vêm do .env
    // (desenvolvimento), do .env.test (testes) ou das variáveis do ambiente (produção);
    // `validate` impede a aplicação de subir com configuração ausente ou insegura.
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
      validate,
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    VehiclesModule,
    DriversModule,
    GeoModule,
    RoutesModule,
    StudentsModule,
    GuardianRelationsModule,
    TripsModule,
  ],
  controllers: [AppController],
  providers: [
    // Globais registrados aqui (e não no main.ts) para valerem também nos testes e2e.
    {
      // Valida todo body/query/param. `whitelist` remove campos não declarados no DTO e
      // `forbidNonWhitelisted` os rejeita com 400 (ex.: impede enviar `role: ADMIN` no cadastro).
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },
    // Guards globais. A ORDEM importa: 1) API key (toda rota, inclusive login e cadastro),
    // 2) JWT (toda rota, exceto @Public), 3) papéis (@Roles).
    { provide: APP_GUARD, useClass: ApiKeyGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
