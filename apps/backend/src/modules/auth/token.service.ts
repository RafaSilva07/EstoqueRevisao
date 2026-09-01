import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { JwtPayload } from './authenticated-user.interface';
import { UserEntity } from '../users/entities/user.entity';

export interface AccessTokenResult {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async createAccessToken(user: UserEntity, sessionId: string): Promise<AccessTokenResult> {
    const expiresIn = this.configService.getOrThrow<string>('JWT_ACCESS_TTL');
    const payload: JwtPayload = {
      sub: user.id,
      sid: sessionId,
      username: user.username,
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      tokenType: 'Bearer',
      expiresIn,
    };
  }

  createRefreshToken(): string {
    return randomBytes(48).toString('base64url');
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  refreshTokenExpiresAt(): Date {
    const days = this.configService.getOrThrow<number>('REFRESH_TOKEN_TTL_DAYS');
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }
}
