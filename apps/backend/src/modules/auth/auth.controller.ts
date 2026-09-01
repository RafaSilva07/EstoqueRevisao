import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { getAuditRequestMetadata } from '../audit/audit-request-metadata';
import { REFRESH_TOKEN_COOKIE } from './auth.constants';
import { AuthenticatedUser } from './authenticated-user.interface';
import { AuthenticationResult, AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Omit<AuthenticationResult, 'refreshToken'>> {
    const result = await this.authService.login(dto, getAuditRequestMetadata(request));
    this.setRefreshCookie(response, result.refreshToken);
    return this.withoutRefreshToken(result);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Omit<AuthenticationResult, 'refreshToken'>> {
    const token = this.readRefreshToken(request);
    if (!token) {
      throw new UnauthorizedException({
        code: 'MISSING_REFRESH_TOKEN',
        message: 'Token de renovacao ausente.',
      });
    }

    const result = await this.authService.refresh(token, getAuditRequestMetadata(request));
    this.setRefreshCookie(response, result.refreshToken);
    return this.withoutRefreshToken(result);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.logout(
      this.readRefreshToken(request),
      getAuditRequestMetadata(request),
    );
    response.clearCookie(REFRESH_TOKEN_COOKIE, this.cookieOptions());
  }

  @Get('me')
  me(@Req() request: Request): AuthenticatedUser {
    return request.user as AuthenticatedUser;
  }

  private setRefreshCookie(response: Response, refreshToken: string): void {
    const days = this.configService.getOrThrow<number>('REFRESH_TOKEN_TTL_DAYS');
    response.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
      ...this.cookieOptions(),
      maxAge: days * 24 * 60 * 60 * 1000,
    });
  }

  private cookieOptions(): {
    httpOnly: true;
    secure: boolean;
    sameSite: 'strict';
    path: string;
  } {
    return {
      httpOnly: true,
      secure: this.configService.getOrThrow<boolean>('AUTH_COOKIE_SECURE'),
      sameSite: 'strict',
      path: '/api/v1/auth',
    };
  }

  private readRefreshToken(request: Request): string | undefined {
    const cookies = request.cookies as Record<string, unknown> | undefined;
    const value = cookies?.[REFRESH_TOKEN_COOKIE];
    return typeof value === 'string' ? value : undefined;
  }

  private withoutRefreshToken(
    result: AuthenticationResult,
  ): Omit<AuthenticationResult, 'refreshToken'> {
    return {
      accessToken: result.accessToken,
      tokenType: result.tokenType,
      expiresIn: result.expiresIn,
      user: result.user,
    };
  }
}
