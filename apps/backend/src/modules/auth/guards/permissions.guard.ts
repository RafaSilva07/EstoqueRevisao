import { BadRequestException, CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ANY_PERMISSIONS_KEY, OPERATIONAL_SECTOR_HEADER, REQUIRED_PERMISSIONS_KEY } from '../auth.constants';
import { AuthenticatedUser } from '../authenticated-user.interface';
import { allowedOperationalModes, allOperationalModes } from '../operational-modes';
import { permissionAllowedInMode } from '../permission-scopes';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) ?? [];
    const any = this.reflector.getAllAndOverride<string[]>(ANY_PERMISSIONS_KEY, [context.getHandler(), context.getClass()]) ?? [];

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedUser | undefined;
    const requestedSector = request.headers[OPERATIONAL_SECTOR_HEADER];
    let operationalMode = user?.roles.includes('ADMIN') ? 'ADMIN' : user?.sector;
    if (requestedSector !== undefined) {
      if (typeof requestedSector !== 'string' || !allOperationalModes.includes(requestedSector as typeof allOperationalModes[number])) {
        throw new BadRequestException('Modo operacional inválido.');
      }
      if (!user || !allowedOperationalModes(user.roles).includes(requestedSector)) {
        throw new ForbiddenException('Este perfil não pode acessar o modo operacional solicitado.');
      }
      operationalMode = requestedSector;
      user.sector = requestedSector === 'ADMIN' ? 'REVISAO' : requestedSector;
    }
    if (required.length === 0 && any.length === 0) return true;
    const has = (permission: string): boolean => Boolean(user?.permissions.includes(permission) && permissionAllowedInMode(permission, operationalMode));
    return required.every(has) && (!any.length || any.some(has));
  }
}
