import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { AuthSessionsRepository } from './auth-sessions.repository';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthSessionEntity } from './entities/auth-session.entity';
import { JwtStrategy } from './jwt.strategy';
import { PasswordHasherService } from './password-hasher.service';
import { TokenService } from './token.service';
import { PresenceController } from './presence.controller';
import { PresenceRepository } from './presence.repository';
import { PresenceService } from './presence.service';
import { AuthOriginGuard } from './guards/auth-origin.guard';

@Module({
  imports: [
    UsersModule,
    TypeOrmModule.forFeature([AuthSessionEntity]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService): JwtModuleOptions => {
        const expiresIn = configService.getOrThrow<string>('JWT_ACCESS_TTL') as NonNullable<
          JwtModuleOptions['signOptions']
        >['expiresIn'];
        return {
          secret: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
          signOptions: { expiresIn },
        };
      },
    }),
  ],
  controllers: [AuthController, PresenceController],
  providers: [
    AuthService,
    AuthOriginGuard,
    AuthSessionsRepository,
    PasswordHasherService,
    TokenService,
    JwtStrategy,
    PresenceRepository,
    PresenceService,
  ],
  exports: [PasswordHasherService],
})
export class AuthModule {}
