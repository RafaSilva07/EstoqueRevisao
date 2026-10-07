import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class AuthOriginGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const allowedOrigin = new URL(this.configService.getOrThrow<string>('FRONTEND_URL')).origin;
    // CORS controls reading the response, not whether a request changes a cookie/session.
    if (request.headers.origin !== allowedOrigin) {
      throw new ForbiddenException({
        code: 'AUTH_ORIGIN_NOT_ALLOWED',
        message: 'Origem nao autorizada. Acesse pelo endereco configurado da aplicacao.',
      });
    }
    return true;
  }
}
