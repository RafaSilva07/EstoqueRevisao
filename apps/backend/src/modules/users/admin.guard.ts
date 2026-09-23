import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedUser } from '../auth/authenticated-user.interface';
import { OPERATIONAL_SECTOR_HEADER } from '../auth/auth.constants';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedUser | undefined;
    const mode = request.headers?.[OPERATIONAL_SECTOR_HEADER];
    return Boolean(user?.roles.includes('ADMIN') && (mode === undefined || mode === 'ADMIN'));
  }
}
