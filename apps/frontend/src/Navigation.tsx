import { ReactNode } from 'react';
import { UserSession } from './api';
import { EmptyState, PageHeader } from './components';

import { homeActions, menuActions, MenuAction, Page, pageTitles, parentPage } from './navigation-model';

function SidebarIcon({ page }: { page: Page }) {
  let shape: ReactNode;
  switch (page) {
    case 'home': shape = <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-7h6v7" /></>; break;
    case 'operations': shape = <><path d="M4 7h15m0 0-4-4m4 4-4 4M20 17H5m0 0 4-4m-4 4 4 4" /></>; break;
    case 'shipments': shape = <><path d="m3 7 9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10M8 5l9 4" /></>; break;
    case 'inventory': shape = <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M4 10h16M9 14h6M9 17h6" /></>; break;
    case 'history': shape = <><path d="M4.5 8A9 9 0 1 1 3 12M3 5v4h4M12 7v5l3 2" /></>; break;
    case 'products': shape = <><path d="M3 4h11l7 8-7 8H3z" /><circle cx="8" cy="12" r="1" /></>; break;
    case 'pcp': shape = <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4.5V3h6v1.5M8 11l1.5 1.5L12 10M8 17h8" /></>; break;
    case 'online-users': shape = <><circle cx="9" cy="8" r="3" /><path d="M3.5 20v-2a5.5 5.5 0 0 1 11 0v2M17 6a3 3 0 0 1 0 6m1.5 3a4.5 4.5 0 0 1 2 3.7V20" /></>; break;
    case 'preferences': shape = <><path d="M12 3a9 9 0 1 0 0 18h1.5a2 2 0 0 0 1.5-3.3 1.8 1.8 0 0 1 1.3-3h1.2A3.5 3.5 0 0 0 21 11.2 9 9 0 0 0 12 3Z" /><circle cx="7.5" cy="11" r=".7" /><circle cx="10" cy="7.5" r=".7" /><circle cx="15" cy="7.5" r=".7" /></>; break;
    default: shape = <><circle cx="12" cy="12" r="9" /><circle cx="7" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="17" cy="12" r="1" /></>;
  }
  return <svg className="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{shape}</svg>;
}

export function SidebarNavigation({ page, user, areas, modeLabel, expanded, showOnlineUsers = false, onToggle, navigate }: {
  page: Page; user: UserSession; areas: MenuAction[]; modeLabel: string; expanded: boolean; showOnlineUsers?: boolean;
  onToggle: () => void; navigate: (page: Page) => void;
}) {
  const currentSection = page === 'preferences' || page === 'online-users' ? page : ['more', 'users', 'settings', 'stocks', 'reports', 'reports-reviews'].includes(page)
    ? 'more' : areas.some((area) => area.page === page) ? page : parentPage(page, user);
  const links: Array<{ page: Page; title: string }> = [{ page: 'home', title: 'Início' }, ...areas, { page: 'more', title: 'Menu e conta' }, ...(showOnlineUsers ? [{ page: 'online-users' as const, title: 'Usuários online' }] : []), { page: 'preferences', title: 'Preferências' }];
  const toggleLabel = expanded ? 'Recolher menu lateral' : 'Expandir menu lateral';
  return <aside className={`sidebar ${expanded ? 'sidebar-expanded' : 'sidebar-collapsed'}`}>
    <div className="sidebar-main">
      <div className="sidebar-controls"><button type="button" className="sidebar-toggle" aria-label={toggleLabel} aria-expanded={expanded} aria-controls="sidebar-navigation" title={toggleLabel} onClick={onToggle}>
        <svg className="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /><path d={expanded ? 'm16 9-3 3 3 3' : 'm14 9 3 3-3 3'} /></svg>
        <span className="sidebar-label">{expanded ? 'Recolher menu' : 'Abrir menu'}</span>
      </button></div>
      <nav id="sidebar-navigation" aria-label="Navegação principal">{links.map((link) => <button key={link.page} type="button" className={`sidebar-link${currentSection === link.page ? ' current' : ''}`} aria-label={link.title} aria-current={currentSection === link.page ? 'page' : undefined} title={expanded ? undefined : link.title} onClick={() => navigate(link.page)}><SidebarIcon page={link.page} /><span className="sidebar-label">{link.title}</span></button>)}</nav>
    </div>
    <div className="sidebar-footer" title={expanded ? undefined : `Modo: ${modeLabel}`}><span className="sidebar-mode-dot" aria-hidden="true" /><span className="sidebar-label">{modeLabel}</span></div>
  </aside>;
}

export function SectionMenu({ page, user, showOnlineUsers = false, navigate }: { page: Page; user: UserSession; showOnlineUsers?: boolean; navigate: (page: Page) => void }) {
  const actions = page === 'home' ? homeActions(user) : menuActions(page, user);
  if (page === 'more' && showOnlineUsers) actions.push({ page: 'online-users', title: 'Usuários online', description: 'Ver quem está ativo em cada área.' });
  return <><PageHeader eyebrow={pageTitles[page]} title={page === 'home' ? 'O que você quer fazer?' : pageTitles[page]} description={page === 'home' ? 'Escolha uma opção para começar.' : 'Escolha uma opção para continuar.'} />
    <section className="section-menu" aria-label={pageTitles[page]}>{actions.map((action) => <button type="button" className="action-card" key={action.page} onClick={() => navigate(action.page)}><span>{action.title}</span><small>{action.description}</small><span className="action-card-arrow" aria-hidden="true">→</span></button>)}</section>
    {!actions.length && <EmptyState title="Nenhuma opção disponível" description="Não há ações disponíveis para seu perfil nesta área." />}</>;
}

export function NavigationTrail({ page, user, navigate }: { page: Page; user?: UserSession; navigate: (page: Page) => void }) {
  if (page === 'home') return null;
  const parent = parentPage(page, user);
  return <div className="navigation-trail"><button type="button" className="secondary" onClick={() => navigate(parent)}>← Voltar</button><nav aria-label="Caminho de navegação"><ol><li><button className="text-button" onClick={() => navigate('home')}>Início</button></li>{parent !== 'home' && <li><button className="text-button" onClick={() => navigate(parent)}>{pageTitles[parent]}</button></li>}<li aria-current="page">{pageTitles[page]}</li></ol></nav></div>;
}
