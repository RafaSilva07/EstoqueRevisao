import { UserSession } from './api';

export type Page = 'home' | 'operations' | 'requests' | 'stock-menu' | 'history-menu' | 'pcp-menu' | 'pcp' | 'pcp-all' | 'pcp-executed' | 'users' | 'shipments' | 'shipment-new' | 'shipment-sent' | 'shipment-history' | 'new-entry' | 'new-exit' | 'new-transfer' | 'new-review' | 'movements' | 'inventory' | 'reports' | 'reports-reviews' | 'reports-stock' | 'products' | 'stocks' | 'more';
export type MenuAction = { page: Page; title: string; description: string };

export const pageTitles: Record<Page, string> = {
  home: 'Início', operations: 'Movimentar produtos', requests: 'Solicitações',
  'stock-menu': 'Estoque', 'history-menu': 'Histórico', 'pcp-menu': 'PCP',
  pcp: 'Pendentes de execução', 'pcp-all': 'Todas as movimentações', 'pcp-executed': 'Executadas',
  users: 'Gerenciar usuários', shipments: 'Pendentes de aceite', 'shipment-new': 'Novo envio',
  'shipment-sent': 'Acompanhar solicitações', 'shipment-history': 'Histórico de solicitações',
  'new-entry': 'Realizar entrada', 'new-exit': 'Realizar saída', 'new-transfer': 'Transferência interna',
  'new-review': 'Realizar revisão', movements: 'Movimentações', inventory: 'Saldos e lotes',
  reports: 'Relatório de movimentações', 'reports-reviews': 'Relatório de revisões',
  'reports-stock': 'Estoque e validades', products: 'Produtos', stocks: 'Estoques e locais', more: 'Menu',
};

export function parentPage(page: Page, user?: UserSession): Page {
  if (user && homeActions(user).some((action) => action.page === page)) return 'home';
  if (page.startsWith('new-')) return 'operations';
  if (['shipments', 'shipment-new', 'shipment-sent', 'shipment-history'].includes(page)) return 'requests';
  if (['inventory', 'reports-stock', 'stocks'].includes(page)) return 'stock-menu';
  if (['movements', 'reports', 'reports-reviews'].includes(page)) return 'history-menu';
  if (['pcp', 'pcp-all', 'pcp-executed'].includes(page)) return 'pcp-menu';
  if (page === 'users') return 'more';
  return 'home';
}

// A small set of actions is shown directly; larger menus retain area grouping.
export function homeActions(user: UserSession): MenuAction[] {
  const areas = menuActions('home', user);
  const actions = areas.flatMap((area) => {
    const children = menuActions(area.page, user);
    return children.length ? children : [area];
  });
  return actions.length <= 6 ? actions : areas;
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
  if (page === 'home' || page === 'more') {
    add(review && can('movements.create'), 'operations', admin ? 'Entrar, sair, transferir ou revisar.' : 'Transferir ou revisar produtos.');
    add(review && (can('stock-positions.read') || can('stocks.read')), 'stock-menu', 'Consultar saldos, lotes e locais.');
    add(sector !== 'PCP' && can('shipments.read'), 'requests', 'Enviar, receber e acompanhar.');
    add(review && can('movements.read'), 'history-menu', 'Consultar movimentações e relatórios.');
    add(review && can('products.read'), 'products', 'Buscar e consultar o cadastro.');
    add(sector === 'PCP' && can('pcp.movements.read'), 'pcp-menu', 'Consultar a execução administrativa.');
    if (page === 'more') add(user.roles.includes('ADMIN'), 'users', 'Administrar contas e perfis.');
  } else if (page === 'operations') {
    add(review && admin && can('movements.create'), 'new-entry', 'Receber de uma origem externa.');
    add(review && admin && can('movements.create'), 'new-exit', 'Enviar para um destino externo.');
    add(review && can('movements.create'), 'new-transfer', 'Mover produtos entre locais.');
    add(review && can('movements.create'), 'new-review', 'Classificar produtos em revisão.');
  } else if (page === 'requests' && sector !== 'PCP' && can('shipments.read')) {
    add(can('shipments.create'), 'shipment-new', review ? 'Enviar para Produção ou Expedição.' : 'Enviar produtos para a Revisão.', review ? 'Enviar da Revisão' : 'Enviar para Revisão');
    add(can('shipments.decide'), 'shipments', 'Conferir os recebimentos do seu setor.');
    add(true, 'shipment-sent', 'Consultar os envios feitos por você.');
    add(true, 'shipment-history', 'Consultar decisões e detalhes.', 'Histórico');
  } else if (page === 'stock-menu' && review) {
    add(can('stock-positions.read'), 'inventory', 'Consultar por produto, lote e local.');
    add(can('stock-positions.read'), 'reports-stock', 'Consultar saldos e prazos de validade.');
    add(can('stocks.read'), 'stocks', 'Consultar a estrutura dos locais.');
  } else if (page === 'history-menu' && review) {
    add(can('movements.read'), 'movements', 'Consultar operações e seus detalhes.');
    add(can('movements.read'), 'reports', 'Filtrar movimentações por período.');
    add(can('movements.read'), 'reports-reviews', 'Consultar as classificações realizadas.');
  } else if (page === 'pcp-menu' && sector === 'PCP' && can('pcp.movements.read')) {
    add(true, 'pcp', 'Consultar a fila de trabalho.');
    add(true, 'pcp-all', 'Consultar todos os status.');
    add(true, 'pcp-executed', 'Consultar os lançamentos realizados.');
  }
  return actions;
}
