// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UserSession } from './api';
import { SidebarNavigation } from './Navigation';
import { homeActions } from './navigation-model';

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
  it('exibe somente destinos permitidos, com ícones, nome acessível e seção ativa', () => {
    const html = renderToStaticMarkup(<SidebarNavigation page="shipments" user={baseUser} areas={homeActions(baseUser)} modeLabel="Expedição" expanded={false} onToggle={noop} navigate={noop} />);
    expect(html).toContain('sidebar-collapsed');
    expect(html).toContain('aria-label="Expandir menu lateral"');
    expect(html).toContain('aria-label="Envios e recebimentos" aria-current="page"');
    expect(html).not.toContain('aria-label="Movimentar produtos"');
    expect((html.match(/class="sidebar-icon"/g) ?? []).length).toBe(homeActions(baseUser).length + 3);
    const pcp = { ...baseUser, sector: 'PCP' as const, permissions: ['pcp.movements.read', 'products.read', 'stock-positions.read'] };
    const pcpHtml = renderToStaticMarkup(<SidebarNavigation page="pcp-all" user={pcp} areas={homeActions(pcp)} modeLabel="PCP" expanded onToggle={noop} navigate={noop} />);
    expect(pcpHtml).toContain('sidebar-expanded');
    expect(pcpHtml).toContain('aria-label="Fila do PCP" aria-current="page"');
  });

  it('navega diretamente no ícone e abre ou recolhe os rótulos', () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const navigate = vi.fn();
    function Harness() {
      const [expanded, setExpanded] = useState(false);
      return <SidebarNavigation page="home" user={baseUser} areas={homeActions(baseUser)} modeLabel="Expedição" expanded={expanded} onToggle={() => setExpanded((value) => !value)} navigate={navigate} />;
    }
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    act(() => root?.render(<Harness />));
    expect(host.querySelector('.sidebar-collapsed')).not.toBeNull();
    act(() => host?.querySelector<HTMLButtonElement>('[aria-label="Envios e recebimentos"]')?.click());
    expect(navigate).toHaveBeenCalledWith('shipments');
    act(() => host?.querySelector<HTMLButtonElement>('[aria-label="Expandir menu lateral"]')?.click());
    expect(host.querySelector('.sidebar-expanded')).not.toBeNull();
    expect(host.querySelector('[aria-label="Recolher menu lateral"]')).not.toBeNull();
    act(() => host?.querySelector<HTMLButtonElement>('[aria-label="Recolher menu lateral"]')?.click());
    expect(host.querySelector('.sidebar-collapsed')).not.toBeNull();
  });
});
