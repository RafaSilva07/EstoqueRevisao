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
    let operationalMode = user?.roles.includes('ADMIN') ? 'ADMIN' : user?.sector;
    if (requestedSector !== undefined) {
      if (!user?.roles.includes('ADMIN')) {
        throw new ForbiddenException('Somente administradores podem alternar o setor operacional.');
      }
      if (typeof requestedSector !== 'string' || !['ADMIN', 'REVISAO', 'PRODUCAO', 'EXPEDICAO', 'PCP'].includes(requestedSector)) {
        throw new BadRequestException('Modo operacional inválido.');
      }
      operationalMode = requestedSector;
      user.sector = requestedSector === 'ADMIN' ? 'REVISAO' : requestedSector;
    }
    const reviewPermissions = ['products.read', 'products.create', 'products.update', 'product-conversions.read', 'batches.read', 'stocks.read', 'stock-positions.read', 'movements.read', 'movements.create', 'shipments.read', 'shipments.create', 'shipments.decide'];
    const pcpPermissions = ['pcp.movements.read', 'pcp.movements.execute', 'products.read', 'products.create', 'products.update', 'batches.read', 'stocks.read', 'stock-positions.read', 'shipments.read'];
    if (operationalMode === 'REVISAO' && required.some((permission) => !reviewPermissions.includes(permission))) return false;
    if (operationalMode === 'PCP' && required.some((permission) => !pcpPermissions.includes(permission))) return false;
    if (operationalMode && !['ADMIN', 'REVISAO', 'PCP'].includes(operationalMode) && required.some((permission) => !permission.startsWith('shipments.') && !['products.read', 'products.create', 'products.update'].includes(permission))) return false;
    return Boolean(user && required.every((permission) => user.permissions.includes(permission)));
  }
}
