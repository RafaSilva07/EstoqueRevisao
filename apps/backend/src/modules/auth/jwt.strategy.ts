import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser, JwtPayload } from './authenticated-user.interface';
import { AuthService } from './auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.authService.validateAccess(payload.sub, payload.sid);
    if (!user) {
      throw new UnauthorizedException({
        code: 'INVALID_SESSION',
        message: 'Sessao invalida ou expirada.',
      });
    }
    return user;
  }
}
