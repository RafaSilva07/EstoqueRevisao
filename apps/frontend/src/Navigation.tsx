import { ReactNode, useEffect, useId } from 'react';
import { UserSession } from './api';
import { EmptyState, Modal, PageHeader } from './components';

import { homeWorkflowActions, menuActions, mobileNavigationActions, navigationGroups, navigationSection, MenuAction, Page, pageTitles, parentPage } from './navigation-model';
import { sectorLabel } from './shipments';

function SidebarIcon({ page }: { page: Page }) {
  let shape: ReactNode;
  switch (page) {
    case 'home': shape = <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-7h6v7" /></>; break;
    case 'new-review': shape = <><rect x="4" y="4" width="16" height="17" rx="2" /><path d="M9 4V2h6v2M8 12l3 3 5-6" /></>; break;
    case 'shipment-new': shape = <><path d="M4 13v7h16v-7M12 16V3m-5 5 5-5 5 5" /></>; break;
    case 'new-entry': shape = <><path d="M4 13v7h16v-7M12 3v13m-5-5 5 5 5-5" /></>; break;
    case 'new-exit': shape = <><path d="M4 5h8v15H4zM10 12h11m-4-4 4 4-4 4" /></>; break;
    case 'new-transfer':
    case 'operations': shape = <><path d="M4 7h15m0 0-4-4m4 4-4 4M20 17H5m0 0 4-4m-4 4 4 4" /></>; break;
    case 'shipments': shape = <><path d="m3 7 9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10M8 5l9 4" /></>; break;
    case 'stocks':
    case 'inventory': shape = <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M4 10h16M9 14h6M9 17h6" /></>; break;
    case 'shipment-separation': shape = <><path d="M6 3h12M6 21h12M7 3v4l10 10v4M17 3v4L7 17v4M9 6h6M9 18h6" /></>; break;
    case 'shipment-sent': shape = <><path d="m3 11 18-8-8 18-2-8-8-2ZM11 13l10-10" /></>; break;
    case 'history': shape = <><path d="M4.5 8A9 9 0 1 1 3 12M3 5v4h4M12 7v5l3 2" /></>; break;
    case 'products': shape = <><path d="M3 4h11l7 8-7 8H3z" /><circle cx="8" cy="12" r="1" /></>; break;
    case 'pcp': shape = <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4.5V3h6v1.5M8 11l1.5 1.5L12 10M8 17h8" /></>; break;
    case 'users':
    case 'online-users': shape = <><circle cx="9" cy="8" r="3" /><path d="M3.5 20v-2a5.5 5.5 0 0 1 11 0v2M17 6a3 3 0 0 1 0 6m1.5 3a4.5 4.5 0 0 1 2 3.7V20" /></>; break;
    case 'reports':
    case 'reports-reviews': shape = <><path d="M14 3H5v18h14V8l-5-5v5h5M8 12h8M8 16h8" /></>; break;
    case 'settings': shape = <><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2" /></>; break;
    case 'more': shape = <path d="M4 6h16M4 12h16M4 18h16" />; break;
    case 'preferences': shape = <><path d="M12 3a9 9 0 1 0 0 18h1.5a2 2 0 0 0 1.5-3.3 1.8 1.8 0 0 1 1.3-3h1.2A3.5 3.5 0 0 0 21 11.2 9 9 0 0 0 12 3Z" /><circle cx="7.5" cy="11" r=".7" /><circle cx="10" cy="7.5" r=".7" /><circle cx="15" cy="7.5" r=".7" /></>; break;
    default: shape = <><circle cx="12" cy="12" r="9" /><circle cx="7" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="17" cy="12" r="1" /></>;
  }
  return <svg className="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{shape}</svg>;
}

function NavigationContents({ page, user, compact = false, showOnlineUsers = false, navigate, id }: {
  page: Page; user: UserSession; compact?: boolean; showOnlineUsers?: boolean; navigate: (page: Page) => void; id?: string;
}) {
  const headingId = useId();
  const groups = navigationGroups(user, showOnlineUsers);
  const current = navigationSection(page);
  const renderLink = (action: MenuAction) => <button key={action.page} type="button" className={`sidebar-link${current === action.page ? ' current' : ''}`} aria-label={action.title} aria-current={current === action.page ? 'page' : undefined} title={compact ? action.title : undefined} onClick={() => navigate(action.page)}>
    <SidebarIcon page={action.page} /><span className="sidebar-link-copy"><span className="sidebar-label">{action.title}</span><small className="sidebar-description">{action.description}</small></span><span className="navigation-link-arrow" aria-hidden="true">›</span>
  </button>;
  return <nav id={id} className="grouped-navigation" aria-label="Navegação principal">
    {renderLink({ page: 'home', title: 'Início', description: 'Ações principais e andamento do seu setor.' })}
    {groups.map((group, index) => <div className="navigation-group" key={group.title} aria-labelledby={`${headingId}-${index}`}>
      <h3 className="navigation-group-title" id={`${headingId}-${index}`}>{group.title}</h3>
      {group.actions.map(renderLink)}
    </div>)}
  </nav>;
}

export function SidebarNavigation({ page, user, modeLabel, expanded, showOnlineUsers = false, onToggle, navigate }: {
  page: Page; user: UserSession; modeLabel: string; expanded: boolean; showOnlineUsers?: boolean;
  onToggle: () => void; navigate: (page: Page) => void;
}) {
  const toggleLabel = expanded ? 'Recolher menu lateral' : 'Expandir menu lateral';
  return <aside className={`sidebar ${expanded ? 'sidebar-expanded' : 'sidebar-collapsed'}`}>
    <div className="sidebar-main">
      <div className="sidebar-controls"><button type="button" className="sidebar-toggle" aria-label={toggleLabel} aria-expanded={expanded} aria-controls="sidebar-navigation" title={toggleLabel} onClick={onToggle}>
        <svg className="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /><path d={expanded ? 'm16 9-3 3 3 3' : 'm14 9 3 3-3 3'} /></svg>
        <span className="sidebar-label">{expanded ? 'Recolher menu' : 'Abrir menu'}</span>
      </button></div>
      <NavigationContents id="sidebar-navigation" page={page} user={user} compact={!expanded} showOnlineUsers={showOnlineUsers} navigate={navigate} />
    </div>
    <div className="sidebar-footer" title={expanded ? undefined : `Modo: ${modeLabel}`}><span className="sidebar-mode-dot" aria-hidden="true" /><span className="sidebar-label">{modeLabel}</span></div>
  </aside>;
}

export function MobileMenuButton({ open, onOpen }: { open: boolean; onOpen: () => void }) {
  return <button type="button" className="mobile-menu-button" aria-label="Abrir menu" aria-expanded={open} aria-controls="mobile-navigation" onClick={onOpen}><SidebarIcon page="more" /></button>;
}

export function MobileNavigationDrawer({ page, user, modeLabel, showOnlineUsers = false, loggingOut = false, onClose, navigate, onLogout }: {
  page: Page; user: UserSession; modeLabel: string; showOnlineUsers?: boolean; loggingOut?: boolean;
  onClose: () => void; navigate: (page: Page) => void; onLogout: () => void;
}) {
  useEffect(() => {
    const desktop = window.matchMedia?.('(min-width: 1024px)');
    const resized = () => { if (desktop?.matches) onClose(); };
    desktop?.addEventListener('change', resized);
    return () => desktop?.removeEventListener('change', resized);
  }, [onClose]);
  return <Modal labelledBy="mobile-navigation-title" className="navigation-drawer" onClose={onClose}>
    <div className="navigation-drawer-heading"><div><p className="eyebrow">{modeLabel}</p><h2 id="mobile-navigation-title">Menu</h2></div><button type="button" className="secondary" aria-label="Fechar menu" onClick={onClose}>Fechar <span aria-hidden="true">×</span></button></div>
    <NavigationContents id="mobile-navigation" page={page} user={user} showOnlineUsers={showOnlineUsers} navigate={navigate} />
    <div className="navigation-drawer-account"><div><small>Conectado como</small><strong>{user.username}</strong></div><button type="button" className="secondary" disabled={loggingOut} onClick={onLogout}>{loggingOut ? 'Saindo…' : 'Sair da conta'}</button></div>
  </Modal>;
}

export function MobileBottomNavigation({ page, user, menuOpen, onMenu, navigate }: { page: Page; user: UserSession; menuOpen: boolean; onMenu: () => void; navigate: (page: Page) => void }) {
  const current = navigationSection(page);
  const shortcuts = mobileNavigationActions(user);
  const menuActive = menuOpen || !shortcuts.some((action) => action.page === current);
  return <nav className="bottom-nav" aria-label="Navegação principal mobile">
    {shortcuts.map((action) => <button key={action.page} type="button" className={!menuOpen && current === action.page ? 'current' : ''} aria-current={!menuOpen && current === action.page ? 'page' : undefined} onClick={() => navigate(action.page)}><SidebarIcon page={action.page} /><span>{action.title}</span></button>)}
    <button type="button" className={`mobile-menu-trigger${menuActive ? ' current' : ''}`} aria-expanded={menuOpen} aria-controls="mobile-navigation" onClick={onMenu}><SidebarIcon page="more" /><span>Menu</span></button>
  </nav>;
}

export function SectionMenu({ page, user, showOnlineUsers = false, navigate }: { page: Page; user: UserSession; showOnlineUsers?: boolean; navigate: (page: Page) => void }) {
  if (page === 'home') return <HomeWorkflowMenu user={user} navigate={navigate} />;
  if (page === 'more') return <><PageHeader eyebrow="Todas as opções" title="Menu" description="Acesse as ferramentas e consultas do seu setor." /><section className="surface navigation-menu-page"><NavigationContents page={page} user={user} showOnlineUsers={showOnlineUsers} navigate={navigate} /></section></>;
  const actions = menuActions(page, user);
  return <><PageHeader eyebrow={pageTitles[page]} title={pageTitles[page]} description="Escolha uma opção para continuar." />
    <section className="section-menu" aria-label={pageTitles[page]}>{actions.map((action) => <button type="button" className="action-card" key={action.page} onClick={() => navigate(action.page)}><span>{action.title}</span><small>{action.description}</small><span className="action-card-arrow" aria-hidden="true">→</span></button>)}</section>
    {!actions.length && <EmptyState title="Nenhuma opção disponível" description="Não há ações disponíveis para seu perfil nesta área." />}</>;
}

function HomeWorkflowMenu({ user, navigate }: { user: UserSession; navigate: (page: Page) => void }) {
  const { primary } = homeWorkflowActions(user);
  const sector = user.sector ?? 'REVISAO';
  const title = sector === 'REVISAO' ? 'Receber, revisar e enviar' : sector === 'PCP' ? 'Sua fila de trabalho' : 'Enviar e receber produtos';
  return <div className="home-workflow">
    <PageHeader eyebrow={`Início · ${sectorLabel[sector]}`} title={title} description="Escolha uma ação. Acompanhe as movimentações logo abaixo." />
    {primary.length > 0 && <nav className="home-primary-actions" aria-label="Ações principais">{primary.map((action) => <button type="button" className="home-primary-action" key={action.page} onClick={() => navigate(action.page)}>
      <span className="home-action-icon"><SidebarIcon page={action.page} /></span><span className="home-action-copy"><strong>{action.title}</strong><small>{action.description}</small></span><span className="home-action-arrow" aria-hidden="true">↗</span>
    </button>)}</nav>}
    {!primary.length && <EmptyState title="Suas consultas estão no menu" description="Acesse as ferramentas disponíveis para sua conta ou acompanhe as movimentações abaixo." action={<button type="button" className="secondary" onClick={() => navigate('more')}>Abrir menu</button>} />}
  </div>;
}

export function NavigationTrail({ page, user, navigate }: { page: Page; user?: UserSession; navigate: (page: Page) => void }) {
  if (page === 'home') return null;
  const parent = parentPage(page, user);
  return <div className="navigation-trail"><button type="button" className="secondary" onClick={() => navigate(parent)}>← Voltar</button><nav aria-label="Caminho de navegação"><ol><li><button className="text-button" onClick={() => navigate('home')}>Início</button></li>{parent !== 'home' && <li><button className="text-button" onClick={() => navigate(parent)}>{pageTitles[parent]}</button></li>}<li aria-current="page">{pageTitles[page]}</li></ol></nav></div>;
}
