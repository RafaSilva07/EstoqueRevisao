import { OperationalMode, UserSession } from './api';
import { Sector } from './shipments';

export type { OperationalMode } from './api';

export const operationalModeLabel: Record<OperationalMode, string> = {
  ADMIN: 'Admin geral',
  REVISAO: 'Revisão',
  PRODUCAO: 'Produção',
  EXPEDICAO: 'Expedição',
  PCP: 'PCP',
};

const permissionsByMode: Record<Sector, readonly string[]> = {
  REVISAO: [
    'products.read', 'products.create', 'products.update', 'products.manage-status',
    'product-conversions.read', 'product-conversions.create', 'product-conversions.update', 'product-conversions.manage-status', 'batches.read',
    'stocks.read', 'stocks.create', 'stocks.update', 'stocks.manage-status', 'stock-positions.read', 'movements.read', 'movements.create',
    'movements.external-entry', 'movements.external-exit', 'movements.transfer', 'movements.review', 'movements.cancel',
    'shipments.read', 'shipments.create', 'shipments.decide',
  ],
  PRODUCAO: ['products.read', 'products.create', 'products.update', 'products.manage-status', 'shipments.read', 'shipments.create', 'shipments.decide'],
  EXPEDICAO: ['products.read', 'products.create', 'products.update', 'products.manage-status', 'shipments.read', 'shipments.create', 'shipments.decide'],
  PCP: ['pcp.movements.read', 'pcp.movements.execute', 'products.read', 'products.create', 'products.update', 'products.manage-status', 'batches.read', 'stocks.read', 'stock-positions.read', 'shipments.read'],
};

export function allowedOperationalModes(user: UserSession): OperationalMode[] {
  if (user.roles.includes('ADMIN')) return ['ADMIN', 'REVISAO', 'PRODUCAO', 'EXPEDICAO', 'PCP'];
  if (user.roles.includes('ADMIN_REVISAO_EXPEDICAO')) return ['REVISAO', 'EXPEDICAO'];
  if (user.roles.includes('ADMIN_PRODUCAO_PCP')) return ['PRODUCAO', 'PCP'];
  return [user.sector ?? 'REVISAO'];
}

export function userForOperationalMode(user: UserSession, mode: OperationalMode): UserSession {
  if (!allowedOperationalModes(user).includes(mode)) throw new Error('Modo operacional não permitido.');
  if (mode === 'ADMIN' || allowedOperationalModes(user).length === 1) return { ...user, sector: user.sector ?? 'REVISAO' };
  const allowed = permissionsByMode[mode];
  return {
    ...user,
    sector: mode,
    roles: [mode],
    permissions: user.permissions.filter((permission) => allowed.includes(permission)),
  };
}
