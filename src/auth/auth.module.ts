import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtStrategy } from './jwt.strategy.js';

@Module({
  imports: [
    // Assinatura dos tokens: o segredo e a duração vêm do ambiente (diferentes em cada ambiente).
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        secret: config.getOrThrow('JWT_SECRET', { infer: true }),
        signOptions: {
          // Formato (15m, 1h, 7d) já validado no env.validation.ts.
          expiresIn: config.getOrThrow('JWT_EXPIRES_IN', {
            infer: true,
          }) as JwtSignOptions['expiresIn'],
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule {}
