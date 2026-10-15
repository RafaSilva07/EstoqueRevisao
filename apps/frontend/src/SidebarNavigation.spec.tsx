// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UserSession } from './api';
import { MobileBottomNavigation, MobileMenuButton, MobileNavigationDrawer, SectionMenu, SidebarNavigation } from './Navigation';
import { navigationGroups } from './navigation-model';

const baseUser: UserSession = { id: 'operator', username: 'Operador', sector: 'EXPEDICAO', roles: ['EXPEDICAO'], permissions: ['shipments.read', 'products.read'] };
const noop = () => undefined;
let host: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  host?.remove();
  host = undefined;
  root = undefined;
});

describe('Barra lateral compacta', () => {
  it('oferece usuários online aos administradores sem expor o item aos operadores', () => {
    const admin = { ...baseUser, roles: ['ADMIN_PRODUCAO_PCP'] };
    const html = renderToStaticMarkup(<SidebarNavigation page="online-users" user={admin} modeLabel="PCP" expanded={false} showOnlineUsers onToggle={noop} navigate={noop} />);
    expect(html).toContain('aria-label="Usuários online" aria-current="page"');
    expect(renderToStaticMarkup(<SectionMenu page="more" user={admin} showOnlineUsers navigate={noop} />)).toContain('Usuários online');
    expect(renderToStaticMarkup(<SidebarNavigation page="home" user={baseUser} modeLabel="Expedição" expanded={false} onToggle={noop} navigate={noop} />)).not.toContain('Usuários online');
  });
  it('exibe somente destinos permitidos, com ícones, nome acessível e seção ativa', () => {
    const html = renderToStaticMarkup(<SidebarNavigation page="shipments" user={baseUser} modeLabel="Expedição" expanded={false} onToggle={noop} navigate={noop} />);
    expect(html).toContain('sidebar-collapsed');
    expect(html).toContain('aria-label="Expandir menu lateral"');
    expect(html).toContain('aria-label="Consultar envios" aria-current="page"');
    expect(html).not.toContain('aria-label="Movimentar produtos"');
    expect(html).toContain('aria-label="Preferências"');
    expect(html).toContain('Cadastros'); expect(html).toContain('Minha conta');
    const pcp = { ...baseUser, sector: 'PCP' as const, permissions: ['pcp.movements.read', 'products.read', 'stock-positions.read'] };
    const pcpHtml = renderToStaticMarkup(<SidebarNavigation page="pcp-all" user={pcp} modeLabel="PCP" expanded onToggle={noop} navigate={noop} />);
    expect(pcpHtml).toContain('sidebar-expanded');
    expect(pcpHtml).toContain('aria-label="Fila do PCP" aria-current="page"');
    expect(renderToStaticMarkup(<SidebarNavigation page="preferences" user={baseUser} modeLabel="Expedição" expanded onToggle={noop} navigate={noop} />))
      .toContain('aria-label="Preferências" aria-current="page"');
  });

  it('navega diretamente no ícone e abre ou recolhe os rótulos', () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const navigate = vi.fn();
    function Harness() {
      const [expanded, setExpanded] = useState(false);
      return <SidebarNavigation page="home" user={baseUser} modeLabel="Expedição" expanded={expanded} onToggle={() => setExpanded((value) => !value)} navigate={navigate} />;
    }
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    act(() => root?.render(<Harness />));
    expect(host.querySelector('.sidebar-collapsed')).not.toBeNull();
    act(() => host?.querySelector<HTMLButtonElement>('[aria-label="Consultar envios"]')?.click());
    expect(navigate).toHaveBeenCalledWith('shipments');
    act(() => host?.querySelector<HTMLButtonElement>('[aria-label="Expandir menu lateral"]')?.click());
    expect(host.querySelector('.sidebar-expanded')).not.toBeNull();
    expect(host.querySelector('[aria-label="Recolher menu lateral"]')).not.toBeNull();
    act(() => host?.querySelector<HTMLButtonElement>('[aria-label="Recolher menu lateral"]')?.click());
    expect(host.querySelector('.sidebar-collapsed')).not.toBeNull();
  });
});

describe('Menu compartilhado no celular', () => {
  const review: UserSession = { ...baseUser, sector: 'REVISAO', roles: ['REVISAO'], permissions: ['shipments.read', 'shipments.decide', 'shipments.create', 'movements.review', 'movements.transfer', 'stock-positions.read', 'products.read', 'movements.read'] };
  it('reúne as opções removidas da Home com acesso direto e respeita permissões e setor', () => {
    const pages = navigationGroups(review).flatMap((group) => group.actions.map((action) => action.page));
    for (const page of ['new-transfer', 'inventory', 'products', 'shipment-separation', 'new-review']) expect(pages).toContain(page);
    expect(new Set(pages).size).toBe(pages.length);
    const readonly = navigationGroups({ ...review, permissions: ['products.read', 'shipments.read'] }).flatMap((group) => group.actions.map((action) => action.page));
    expect(readonly).toContain('products'); expect(readonly).not.toContain('new-review'); expect(readonly).not.toContain('shipment-separation');
    for (const sector of ['PRODUCAO', 'EXPEDICAO', 'PCP'] as const) {
      const external = navigationGroups({ ...review, sector }).flatMap((group) => group.actions.map((action) => action.page));
      expect(external).not.toContain('new-transfer'); expect(external).not.toContain('new-review');
    }
  });
  it('abre o menu pelo botão, acessa transferência e fecha por Escape ou pelo fundo', () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const navigate = vi.fn(); const logout = vi.fn();
    function Harness() {
      const [open, setOpen] = useState(false);
      return <><MobileMenuButton open={open} onOpen={() => setOpen(true)} />{open && <MobileNavigationDrawer page="new-transfer" user={review} modeLabel="Revisão" onClose={() => setOpen(false)} navigate={navigate} onLogout={logout} />}</>;
    }
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    act(() => root?.render(<Harness />));
    const open = () => { act(() => { const button = host!.querySelector<HTMLButtonElement>('[aria-label="Abrir menu"]')!; button.focus(); button.click(); }); };
    open();
    expect(host.querySelector('[role=dialog]')?.textContent).toContain('Consultas');
    expect(host.querySelector('[role=dialog]')?.textContent).toContain('Ver estoque');
    expect(host.querySelector('[aria-label="Transferência interna"]')?.getAttribute('aria-current')).toBe('page');
    expect(host.textContent).not.toContain('Gerenciar usuários');
    act(() => host?.querySelector<HTMLButtonElement>('[aria-label="Transferência interna"]')!.click());
    expect(navigate).toHaveBeenCalledExactlyOnceWith('new-transfer');
    // Navegar só fecha o menu quando o dono da navegação autoriza a saída do formulário.
    expect(host.querySelector('[role=dialog]')).not.toBeNull();
    act(() => Array.from(host!.querySelectorAll('button')).find((button) => button.textContent === 'Sair da conta')!.click());
    expect(logout).toHaveBeenCalledOnce();
    act(() => { host?.querySelector('[role=dialog]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(host.querySelector('[role=dialog]')).toBeNull();
    expect(document.activeElement).toBe(host.querySelector('[aria-label="Abrir menu"]'));
    open();
    act(() => { host?.querySelector('.dialog-backdrop')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(host.querySelector('[role=dialog]')).toBeNull();
  });
  it('usa rótulos curtos na barra inferior e oferece o menu em todos os perfis', () => {
    const html = renderToStaticMarkup(<MobileBottomNavigation page="home" user={review} menuOpen={false} onMenu={noop} navigate={noop} />);
    for (const label of ['Início', 'Receber', 'Histórico', 'Menu']) expect(html).toContain(label);
    expect(html).not.toContain('Movimentar produtos'); expect(html).not.toContain('Envios e recebimentos');
    const pcp = renderToStaticMarkup(<MobileBottomNavigation page="pcp-executed" user={{ ...review, sector: 'PCP', permissions: ['pcp.movements.read'] }} menuOpen={false} onMenu={noop} navigate={noop} />);
    expect(pcp).toContain('Fila PCP'); expect(pcp).toContain('aria-current="page"'); expect(pcp).toContain('Menu');
    const limited = renderToStaticMarkup(<MobileBottomNavigation page="products" user={{ ...review, permissions: ['products.read'] }} menuOpen={false} onMenu={noop} navigate={noop} />);
    expect(limited).not.toContain('Histórico'); expect(limited).not.toContain('Receber'); expect(limited).toContain('Menu');
  });
});
