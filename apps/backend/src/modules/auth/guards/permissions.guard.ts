import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { REQUIRED_PERMISSIONS_KEY } from '../auth.constants';
import { AuthenticatedUser } from '../authenticated-user.interface';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) ?? [];

    if (required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedUser | undefined;
    return Boolean(user && required.every((permission) => user.permissions.includes(permission)));
  }
}
