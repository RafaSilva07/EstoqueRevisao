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
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthSessionsRepository,
    PasswordHasherService,
    TokenService,
    JwtStrategy,
  ],
  exports: [PasswordHasherService],
})
export class AuthModule {}
