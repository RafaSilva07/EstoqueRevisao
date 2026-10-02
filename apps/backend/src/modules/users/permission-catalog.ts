import { permissionsByMode } from '../auth/permission-scopes';
import { PermissionEntity } from './entities/permission.entity';

const labels: Record<string, string> = {
  'products.read': 'Consultar produtos', 'products.create': 'Cadastrar produtos', 'products.update': 'Editar produtos', 'products.manage-status': 'Inativar e reativar produtos',
  'product-conversions.read': 'Consultar conversões', 'product-conversions.create': 'Cadastrar conversões', 'product-conversions.update': 'Editar conversões', 'product-conversions.manage-status': 'Inativar e reativar conversões',
  'batches.read': 'Consultar lotes e datas', 'stocks.read': 'Consultar locais de estoque', 'stocks.create': 'Cadastrar locais de estoque', 'stocks.update': 'Editar locais de estoque', 'stocks.manage-status': 'Inativar e reativar locais', 'stock-positions.read': 'Consultar estoque e validades',
  'movements.read': 'Consultar histórico e relatórios', 'movements.external-entry': 'Entrada direta na Revisão', 'movements.external-exit': 'Saída direta da Revisão', 'movements.transfer': 'Transferência interna', 'movements.review': 'Revisar produtos', 'movements.cancel': 'Cancelar e estornar movimentações',
  'shipments.read': 'Consultar envios e recebimentos', 'shipments.create': 'Criar envios', 'shipments.decide': 'Confirmar ou recusar recebimentos', 'pcp.movements.read': 'Consultar fila PCP', 'pcp.movements.execute': 'Executar registros no PCP',
};
export interface PermissionOption { code: string; label: string; group: string; modes: string[]; dependencies: string[] }

export function permissionCatalog(permissions: PermissionEntity[]): PermissionOption[] {
  return permissions.filter((permission) => labels[permission.code]).map(({ code }) => {
    const group = code.startsWith('products.') || code.startsWith('product-conversions.') ? 'Produtos e conversões'
      : code.startsWith('movements.') ? 'Movimentações' : code.startsWith('shipments.') ? 'Envios e recebimentos'
        : code.startsWith('pcp.') ? 'PCP' : 'Estoque e lotes';
    const dependencies = code.startsWith('movements.') && code !== 'movements.read'
      ? ['movements.read', 'products.read', 'stocks.read', 'batches.read', ...(code === 'movements.external-entry' ? [] : ['stock-positions.read'])]
      : code === 'pcp.movements.execute' ? ['pcp.movements.read']
        : code.startsWith('shipments.') && code !== 'shipments.read' ? ['shipments.read', 'products.read']
          : code.startsWith('product-conversions.') && code !== 'product-conversions.read' ? ['products.read', 'product-conversions.read']
            : code.startsWith('products.') && code !== 'products.read' ? ['products.read']
              : code.startsWith('stocks.') && code !== 'stocks.read' ? ['stocks.read']
                : ['stock-positions.read', 'pcp.movements.read'].includes(code) ? ['stocks.read']
                  : code === 'movements.read' ? ['products.read', 'stocks.read']
                    : code === 'product-conversions.read' ? ['products.read'] : [];
    return { code, label: labels[code], group, modes: Object.keys(permissionsByMode).filter((mode) => permissionsByMode[mode].includes(code)), dependencies };
  }).sort((a, b) => a.group.localeCompare(b.group, 'pt-BR') || a.label.localeCompare(b.label, 'pt-BR'));
}
