import { OperationalMode, UserSession } from './api';
import { Sector } from './shipments';

export type { OperationalMode } from './api';

export const operationalModeLabel: Record<OperationalMode, string> = {
  ADMIN: 'Admin',
  REVISAO: 'Revisão',
  PRODUCAO: 'Produção',
  EXPEDICAO: 'Expedição',
  PCP: 'PCP',
};

const permissionsByMode: Record<Sector, readonly string[]> = {
  REVISAO: [
    'products.read', 'products.create', 'products.update', 'product-conversions.read', 'batches.read',
    'stocks.read', 'stock-positions.read', 'movements.read', 'movements.create',
    'shipments.read', 'shipments.create', 'shipments.decide',
  ],
  PRODUCAO: ['products.read', 'products.create', 'products.update', 'shipments.read', 'shipments.create', 'shipments.decide'],
  EXPEDICAO: ['products.read', 'products.create', 'products.update', 'shipments.read', 'shipments.create', 'shipments.decide'],
  PCP: ['pcp.movements.read', 'pcp.movements.execute', 'products.read', 'products.create', 'products.update', 'batches.read', 'stocks.read', 'stock-positions.read', 'shipments.read'],
};

export function userForOperationalMode(user: UserSession, mode: OperationalMode): UserSession {
  if (!user.roles.includes('ADMIN') || mode === 'ADMIN') return { ...user, sector: user.sector ?? 'REVISAO' };
  const allowed = permissionsByMode[mode];
  return {
    ...user,
    sector: mode,
    roles: [mode],
    permissions: user.permissions.filter((permission) => allowed.includes(permission)),
  };
}
