import { UserSession } from './api';

export type Page = 'home' | 'operations' | 'pcp' | 'pcp-all' | 'pcp-executed' | 'users' | 'settings' | 'preferences' | 'online-users' | 'shipments' | 'shipment-new' | 'shipment-sent' | 'shipment-separation' | 'new-entry' | 'new-exit' | 'new-transfer' | 'new-review' | 'movements' | 'history' | 'inventory' | 'reports' | 'reports-reviews' | 'products' | 'stocks' | 'more';
export type MenuAction = { page: Page; title: string; description: string };
export type NavigationGroup = { title: string; actions: MenuAction[] };

export const pageTitles: Record<Page, string> = {
  home: 'Início', operations: 'Movimentar produtos',
  pcp: 'Pendentes de execução', 'pcp-all': 'Todas as movimentações', 'pcp-executed': 'Executadas',
  users: 'Gerenciar usuários', settings: 'Configurações', preferences: 'Preferências', 'online-users': 'Usuários online', shipments: 'Pendentes de aceite', 'shipment-new': 'Novo envio',
  'shipment-sent': 'Meus envios em aberto',
  'shipment-separation': 'Separações em andamento',
  'new-entry': 'Realizar entrada', 'new-exit': 'Realizar saída', 'new-transfer': 'Transferência interna',
  'new-review': 'Realizar revisão', movements: 'Movimentações', history: 'Histórico', inventory: 'Estoque e validades',
  reports: 'Relatório de movimentações', 'reports-reviews': 'Relatório de revisões',
  products: 'Produtos', stocks: 'Estoques e locais', more: 'Menu',
};

export function parentPage(page: Page, user?: UserSession): Page {
  if (user && homeActions(user).some((action) => action.page === page)) return 'home';
  if (page.startsWith('new-')) return 'operations';
  if (['shipment-new', 'shipment-sent', 'shipment-separation'].includes(page)) return 'shipments';
  if (page === 'movements' || page === 'reports' || page === 'reports-reviews') return 'history';
  if (page === 'pcp-all' || page === 'pcp-executed') return 'pcp';
  if (page === 'stocks') return 'more';
  if (page === 'users' || page === 'settings' || page === 'preferences' || page === 'online-users') return 'more';
  return 'home';
}

export function homeActions(user: UserSession): MenuAction[] {
  return menuActions('home', user);
}

export function homeWorkflowActions(user: UserSession): { primary: MenuAction[]; secondary: MenuAction[] } {
  const can = (permission: string) => user.permissions.includes(permission);
  const sector = user.sector ?? 'REVISAO';
  const review = sector === 'REVISAO';
  const shipments = sector !== 'PCP' && can('shipments.read');
  const primary: MenuAction[] = [];
  const secondary: MenuAction[] = [];
  const receive = { page: 'shipments' as const, title: 'Receber produtos', description: 'Confira os produtos que chegaram e confirme o recebimento.' };
  const send = { page: 'shipment-new' as const, title: 'Enviar produtos', description: review ? 'Prepare um envio para Produção ou Expedição.' : 'Prepare um envio para a Revisão.' };
  if (shipments && can('shipments.decide') && review) primary.push(receive);
  if (review && can('movements.review')) primary.push({ page: 'new-review', title: 'Revisar produtos', description: 'Selecione o produto e distribua a quantidade revisada.' });
  if (shipments && can('shipments.create')) primary.push(send);
  if (shipments && can('shipments.decide') && !review) primary.push(receive);
  if (sector === 'PCP' && can('pcp.movements.read')) primary.push({ page: 'pcp', title: 'Fila do PCP', description: can('pcp.movements.execute') ? 'Confira e execute os registros que aguardam sua ação.' : 'Consulte os registros que aguardam execução.' });
  if (review && can('movements.transfer')) secondary.push({ page: 'new-transfer', title: 'Transferência interna', description: 'Mover produtos entre locais.' });
  if ((review || sector === 'PCP') && can('stock-positions.read')) secondary.push({ page: 'inventory', title: 'Ver estoque', description: 'Consultar saldos, lotes e validades.' });
  if (shipments && !can('shipments.decide')) secondary.push({ page: 'shipments', title: 'Consultar envios', description: 'Acompanhar envios e recebimentos.' });
  if (review && can('movements.external-entry')) secondary.push({ page: 'new-entry', title: 'Entrada direta', description: 'Registrar uma entrada sem solicitação de envio.' });
  if (review && can('movements.external-exit')) secondary.push({ page: 'new-exit', title: 'Saída direta', description: 'Registrar saída para outro destino externo.' });
  if (can('products.read')) secondary.push({ page: 'products', title: 'Produtos', description: 'Consultar e manter o cadastro de produtos.' });
  return { primary, secondary };
}

export function navigationGroups(user: UserSession, showOnlineUsers = false): NavigationGroup[] {
  const workflow = homeWorkflowActions(user);
  const areas = homeActions(user);
  const more = menuActions('more', user);
  const canReadShipments = user.sector !== 'PCP' && user.permissions.includes('shipments.read');
  const daily = [...workflow.primary, ...workflow.secondary.filter((action) => action.page.startsWith('new-'))];
  if ((user.sector ?? 'REVISAO') === 'REVISAO' && canReadShipments && user.permissions.includes('shipments.decide')) {
    daily.push({ page: 'shipment-separation', title: 'Separações em andamento', description: 'Retome os recebimentos que precisam de retorno.' });
  }
  const queries = [
    ...workflow.secondary.filter((action) => action.page === 'inventory' || action.page === 'shipments'),
    ...areas.filter((action) => action.page === 'history'),
    ...more.filter((action) => action.page === 'reports' || action.page === 'reports-reviews'),
  ];
  if (canReadShipments) queries.splice(1, 0, { page: 'shipment-sent', title: 'Meus envios em aberto', description: 'Acompanhe os envios que você iniciou.' });
  return [
    { title: 'Dia a dia', actions: daily },
    { title: 'Consultas', actions: queries },
    { title: 'Cadastros', actions: [...workflow.secondary.filter((action) => action.page === 'products'), ...more.filter((action) => action.page === 'stocks')] },
    { title: 'Administração', actions: [...more.filter((action) => action.page === 'users' || action.page === 'settings'), ...(showOnlineUsers ? [{ page: 'online-users' as const, title: 'Usuários online', description: 'Veja quem está ativo em cada setor.' }] : [])] },
    { title: 'Minha conta', actions: more.filter((action) => action.page === 'preferences') },
  ].filter((group) => group.actions.length > 0);
}

export function mobileNavigationActions(user: UserSession): MenuAction[] {
  const areas = homeActions(user);
  const actions: MenuAction[] = [{ page: 'home', title: 'Início', description: 'Voltar à tela inicial.' }];
  if (areas.some((action) => action.page === 'pcp')) actions.push({ page: 'pcp', title: 'Fila PCP', description: 'Consultar a fila do PCP.' });
  else if (areas.some((action) => action.page === 'shipments')) actions.push({ page: 'shipments', title: user.permissions.includes('shipments.decide') ? 'Receber' : 'Envios', description: 'Abrir envios e recebimentos.' });
  if (areas.some((action) => action.page === 'history')) actions.push({ page: 'history', title: 'Histórico', description: 'Consultar as movimentações.' });
  return actions;
}

export function navigationSection(page: Page): Page {
  if (page === 'pcp-all' || page === 'pcp-executed') return 'pcp';
  if (page === 'movements') return 'history';
  return page;
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
    add(review && ['movements.external-entry', 'movements.external-exit', 'movements.transfer', 'movements.review'].some(can), 'operations', 'Operações de estoque disponíveis para sua conta.');
    add(sector !== 'PCP' && can('shipments.read'), 'shipments', 'Enviar, receber e acompanhar entre setores.', 'Envios e recebimentos');
    add((review || sector === 'PCP') && can('stock-positions.read'), 'inventory', 'Ver saldos, lotes e validades.');
    add(can('movements.read') || can('pcp.movements.read') || (sector !== 'PCP' && can('shipments.read')), 'history', 'Encontrar envios e operações pelo status.', 'Histórico');
    add(can('products.read'), 'products', 'Buscar, cadastrar e manter produtos.');
    add(sector === 'PCP' && can('pcp.movements.read'), 'pcp', 'Executar movimentações pendentes.', 'Fila do PCP');
  } else if (page === 'more') {
    add(true, 'preferences', 'Modo claro/escuro e cor do fundo da sua conta.');
    add(review && can('movements.read'), 'reports', 'Totais e exportação de movimentações.', 'Relatórios de movimentações');
    add(review && can('movements.read'), 'reports-reviews', 'Totais por classificação da revisão.', 'Relatórios de revisões');
    add(review && can('stocks.read'), 'stocks', 'Cadastrar e consultar locais de estoque.');
    add(admin, 'users', 'Administrar contas e perfis.');
    add(admin, 'settings', 'Definir prazo e destinos da revisão.');
  } else if (page === 'operations') {
    add(review && can('movements.external-entry'), 'new-entry', 'Receber de uma origem externa.');
    add(review && can('movements.external-exit'), 'new-exit', 'Enviar para um destino externo.');
    add(review && can('movements.transfer'), 'new-transfer', 'Mover produtos entre locais.');
    add(review && can('movements.review'), 'new-review', 'Classificar produtos em revisão.');
  }
  return actions;
}
