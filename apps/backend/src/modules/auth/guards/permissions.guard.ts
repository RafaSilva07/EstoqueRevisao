import { BadRequestException, CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { OPERATIONAL_SECTOR_HEADER, REQUIRED_PERMISSIONS_KEY } from '../auth.constants';
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
    const requestedSector = request.headers[OPERATIONAL_SECTOR_HEADER];
    if (requestedSector !== undefined) {
      if (!user?.roles.includes('ADMIN')) {
        throw new ForbiddenException('Somente administradores podem alternar o setor operacional.');
      }
      if (typeof requestedSector !== 'string' || !['REVISAO', 'PRODUCAO', 'EXPEDICAO', 'PCP'].includes(requestedSector)) {
        throw new BadRequestException('Setor operacional inválido.');
      }
      user.sector = requestedSector;
    }
    const pcpPermissions = ['pcp.movements.read', 'pcp.movements.execute', 'products.read', 'batches.read', 'stocks.read', 'stock-positions.read', 'shipments.read'];
    if (user?.sector === 'PCP' && required.some((permission) => !pcpPermissions.includes(permission))) return false;
    if (user?.sector && !['REVISAO', 'PCP'].includes(user.sector) && required.some((permission) => !permission.startsWith('shipments.') && permission !== 'products.read')) return false;
    return Boolean(user && required.every((permission) => user.permissions.includes(permission)));
  }
}
