import { UserSession } from './api';

export type Page = 'home' | 'operations' | 'pcp' | 'pcp-all' | 'pcp-executed' | 'users' | 'settings' | 'shipments' | 'shipment-new' | 'shipment-sent' | 'new-entry' | 'new-exit' | 'new-transfer' | 'new-review' | 'movements' | 'history' | 'inventory' | 'reports' | 'reports-reviews' | 'products' | 'stocks' | 'more';
export type MenuAction = { page: Page; title: string; description: string };

export const pageTitles: Record<Page, string> = {
  home: 'Início', operations: 'Movimentar produtos',
  pcp: 'Pendentes de execução', 'pcp-all': 'Todas as movimentações', 'pcp-executed': 'Executadas',
  users: 'Gerenciar usuários', settings: 'Configurações', shipments: 'Pendentes de aceite', 'shipment-new': 'Novo envio',
  'shipment-sent': 'Meus envios em aberto',
  'new-entry': 'Realizar entrada', 'new-exit': 'Realizar saída', 'new-transfer': 'Transferência interna',
  'new-review': 'Realizar revisão', movements: 'Movimentações', history: 'Histórico', inventory: 'Estoque e validades',
  reports: 'Relatório de movimentações', 'reports-reviews': 'Relatório de revisões',
  products: 'Produtos', stocks: 'Estoques e locais', more: 'Menu',
};

export function parentPage(page: Page, user?: UserSession): Page {
  if (user && homeActions(user).some((action) => action.page === page)) return 'home';
  if (page.startsWith('new-')) return 'operations';
  if (['shipment-new', 'shipment-sent'].includes(page)) return 'shipments';
  if (page === 'movements' || page === 'reports' || page === 'reports-reviews') return 'history';
  if (page === 'pcp-all' || page === 'pcp-executed') return 'pcp';
  if (page === 'stocks') return 'more';
  if (page === 'users' || page === 'settings') return 'more';
  return 'home';
}

export function homeActions(user: UserSession): MenuAction[] {
  return menuActions('home', user);
}

// Visibility reuses session permissions and the existing operational sector boundaries.
export function menuActions(page: Page, user: UserSession): MenuAction[] {
  const can = (permission: string) => user.permissions.includes(permission);
  const sector = user.sector ?? 'REVISAO';
  const review = sector === 'REVISAO';
  const admin = user.roles.includes('ADMIN');
  const actions: MenuAction[] = [];
  const add = (allowed: boolean, destination: Page, description: string, title = pageTitles[destination]) => {
    if (allowed) actions.push({ page: destination, title, description });
  };
  if (page === 'home') {
    add(review && can('movements.create'), 'operations', admin ? 'Entrada, saída, transferência e revisão.' : 'Transferir ou revisar produtos.');
    add(sector !== 'PCP' && can('shipments.read'), 'shipments', 'Enviar, receber e acompanhar entre setores.', 'Envios e recebimentos');
    add((review || sector === 'PCP') && can('stock-positions.read'), 'inventory', 'Ver saldos, lotes e validades.');
    add(can('movements.read') || can('pcp.movements.read') || (sector !== 'PCP' && can('shipments.read')), 'history', 'Encontrar envios e operações pelo status.', 'Histórico');
    add(can('products.read'), 'products', 'Buscar, cadastrar e manter produtos.');
    add(sector === 'PCP' && can('pcp.movements.read'), 'pcp', 'Executar movimentações pendentes.', 'Fila do PCP');
  } else if (page === 'more') {
    add(review && can('movements.read'), 'reports', 'Totais e exportação de movimentações.', 'Relatórios de movimentações');
    add(review && can('movements.read'), 'reports-reviews', 'Totais por classificação da revisão.', 'Relatórios de revisões');
    add(review && can('stocks.read'), 'stocks', 'Cadastrar e consultar locais de estoque.');
    add(admin, 'users', 'Administrar contas e perfis.');
    add(admin, 'settings', 'Definir prazo e destinos da revisão.');
  } else if (page === 'operations') {
    add(review && admin && can('movements.create'), 'new-entry', 'Receber de uma origem externa.');
    add(review && admin && can('movements.create'), 'new-exit', 'Enviar para um destino externo.');
    add(review && can('movements.create'), 'new-transfer', 'Mover produtos entre locais.');
    add(review && can('movements.create'), 'new-review', 'Classificar produtos em revisão.');
  }
  return actions;
}
