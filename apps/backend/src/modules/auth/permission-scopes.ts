export const movementWritePermissions = ['movements.external-entry', 'movements.external-exit', 'movements.transfer', 'movements.review'];
const productPermissions = ['products.read', 'products.create', 'products.update', 'products.manage-status'];
const shipmentPermissions = ['shipments.read', 'shipments.create', 'shipments.decide'];
export const permissionsByMode: Record<string, readonly string[]> = {
  REVISAO: [...productPermissions, ...shipmentPermissions, ...movementWritePermissions, 'movements.create', 'movements.read', 'movements.cancel',
    'product-conversions.read', 'product-conversions.create', 'product-conversions.update', 'product-conversions.manage-status',
    'batches.read', 'stocks.read', 'stocks.create', 'stocks.update', 'stocks.manage-status', 'stock-positions.read'],
  PRODUCAO: [...productPermissions, ...shipmentPermissions],
  EXPEDICAO: [...productPermissions, ...shipmentPermissions],
  PCP: [...productPermissions, 'pcp.movements.read', 'pcp.movements.execute', 'batches.read', 'stocks.read', 'stock-positions.read', 'shipments.read'],
};

export function permissionAllowedInMode(permission: string, mode: string | undefined): boolean {
  return mode === 'ADMIN' || Boolean(mode && permissionsByMode[mode]?.includes(permission));
}
