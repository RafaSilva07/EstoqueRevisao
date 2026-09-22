import { UserSession } from './api';
import { EmptyState, PageHeader } from './components';

import { homeActions, menuActions, Page, pageTitles, parentPage } from './navigation-model';

export function SectionMenu({ page, user, navigate }: { page: Page; user: UserSession; navigate: (page: Page) => void }) {
  const actions = page === 'home' ? homeActions(user) : menuActions(page, user);
  return <><PageHeader eyebrow={pageTitles[page]} title={page === 'home' ? 'O que você quer fazer?' : pageTitles[page]} description={page === 'home' ? 'Escolha uma opção para começar.' : 'Escolha uma opção para continuar.'} />
    <section className="section-menu" aria-label={pageTitles[page]}>{actions.map((action) => <button type="button" className="action-card" key={action.page} onClick={() => navigate(action.page)}><span>{action.title}</span><small>{action.description}</small><span className="action-card-arrow" aria-hidden="true">→</span></button>)}</section>
    {!actions.length && <EmptyState title="Nenhuma opção disponível" description="Não há ações disponíveis para seu perfil nesta área." />}</>;
}

export function NavigationTrail({ page, user, navigate }: { page: Page; user?: UserSession; navigate: (page: Page) => void }) {
  if (page === 'home') return null;
  const parent = parentPage(page, user);
  return <div className="navigation-trail"><button type="button" className="secondary" onClick={() => navigate(parent)}>← Voltar</button><nav aria-label="Caminho de navegação"><ol><li><button className="text-button" onClick={() => navigate('home')}>Início</button></li>{parent !== 'home' && <li><button className="text-button" onClick={() => navigate(parent)}>{pageTitles[parent]}</button></li>}<li aria-current="page">{pageTitles[page]}</li></ol></nav></div>;
}
