import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module'; // Import UsersModule
import { LocalStrategy } from './strategies/local.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RefreshTokenStrategy } from './strategies/refresh-token.strategy';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    UsersModule, // Make UsersService available for injection
    PassportModule,
    ConfigModule, // Ensure ConfigModule is imported (likely globally in AppModule)
    JwtModule.registerAsync({
      // Use async registration for config
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        // Secrets and expirations are handled within strategies/service now
        // secret: configService.get<string>('JWT_ACCESS_SECRET'), // No longer needed here if strategies handle it
        // signOptions: { expiresIn: configService.get<string>('JWT_ACCESS_EXPIRATION') },
      }),
    }),
  ],
  controllers: [AuthController],
  // Provide all strategies and the service
  providers: [
    AuthService,
    LocalStrategy,
    JwtStrategy,
    RefreshTokenStrategy,
    // You might provide guards here OR globally in AppModule
    // { provide: APP_GUARD, useClass: JwtAuthGuard }, // Example of global JWT guard
  ],
  exports: [AuthService], // Export AuthService if needed elsewhere
})
export class AuthModule {}
