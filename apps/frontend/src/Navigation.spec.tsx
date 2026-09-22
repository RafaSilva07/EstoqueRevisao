import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { UserSession } from './api';
import { NavigationTrail, SectionMenu } from './Navigation';
import { homeActions, menuActions, parentPage } from './navigation-model';
import { ShipmentsPage } from './ShipmentsPage';
import { PcpPage } from './PcpPage';

const user: UserSession = { id: 'u', username: 'Operador', sector: 'REVISAO', roles: [], permissions: ['movements.create', 'movements.read', 'stock-positions.read', 'products.read', 'stocks.read', 'shipments.read', 'shipments.create', 'shipments.decide', 'pcp.movements.read'] };
const noop = () => undefined;

describe('Navegação simplificada', () => {
  it('abre ações diretamente na Home dos perfis com poucas funcionalidades', () => {
    for (const sector of ['PRODUCAO', 'EXPEDICAO'] as const) {
      const external = { ...user, sector };
      expect(homeActions(external).map((a) => a.page)).toEqual(['shipment-new', 'shipments', 'shipment-sent', 'shipment-history']);
      expect(parentPage('shipment-new', external)).toBe('home');
      const html = renderToStaticMarkup(<SectionMenu page="home" user={external} navigate={noop} />);
      expect(html).toContain('Enviar para Revisão');
      expect(html).toContain('Pendentes de aceite');
    }
    const pcp = { ...user, sector: 'PCP' as const };
    expect(homeActions(pcp).map((a) => a.page)).toEqual(['pcp', 'pcp-all', 'pcp-executed']);
    expect(parentPage('pcp-executed', pcp)).toBe('home');
    expect(homeActions({ ...user, permissions: ['shipments.read'] }).map((a) => a.page)).toEqual(['shipment-sent', 'shipment-history']);
  });
  it('limita entrada e saída direta ao administrador mesmo com movements.create', () => {
    expect(menuActions('operations', { ...user, roles: ['REVISAO'] }).map((a) => a.page)).toEqual(['new-transfer', 'new-review']);
    expect(menuActions('operations', { ...user, roles: ['ADMIN'] }).map((a) => a.page)).toEqual(['new-entry', 'new-exit', 'new-transfer', 'new-review']);
    expect(menuActions('more', { ...user, roles: ['REVISAO'] }).some((a) => a.page === 'users')).toBe(false);
  });
  it('mostra somente áreas na Home, sem operações, métricas ou tabelas', () => {
    const html = renderToStaticMarkup(<SectionMenu page="home" user={user} navigate={noop} />);
    for (const title of ['O que você quer fazer?', 'Movimentar produtos', 'Estoque', 'Solicitações', 'Histórico', 'Produtos']) expect(html).toContain(title);
    for (const text of ['Realizar entrada', '<table', 'PCP', 'Gerenciar usuários']) expect(html).not.toContain(text);
  });
  it('preserva as fronteiras dos setores mesmo com permissões de administrador', () => {
    for (const sector of ['PRODUCAO', 'EXPEDICAO'] as const) {
      const external = { ...user, sector, roles: ['ADMIN'] };
      expect(menuActions('home', external).map((a) => a.page)).toEqual(['requests']);
      expect(menuActions('operations', external)).toEqual([]);
      expect(menuActions('requests', external)[0].title).toBe('Enviar para Revisão');
    }
    expect(menuActions('home', { ...user, sector: 'PCP' }).map((a) => a.page)).toEqual(['pcp-menu']);
    expect(menuActions('requests', { ...user, sector: 'PCP' })).toEqual([]);
    expect(menuActions('requests', user)[0].title).toBe('Enviar da Revisão');
  });
  it('omite criação e aceite de quem só consulta e trata ausência de acesso', () => {
    const readOnly = { ...user, permissions: ['shipments.read'] };
    expect(menuActions('requests', readOnly).map((a) => a.page)).toEqual(['shipment-sent', 'shipment-history']);
    expect(menuActions('operations', readOnly)).toEqual([]);
    expect(menuActions('home', { ...user, permissions: [] })).toEqual([]);
  });
  it('fornece retorno curto para cada operação e consulta', () => {
    for (const action of menuActions('operations', user)) expect(parentPage(action.page)).toBe('operations');
    for (const action of menuActions('requests', user)) expect(parentPage(action.page)).toBe('requests');
    const html = renderToStaticMarkup(<NavigationTrail page="new-entry" navigate={noop} />);
    expect(html).toContain('← Voltar');
    expect(html).toContain('Movimentar produtos');
    expect(html).toContain('aria-current="page">Realizar entrada');
    expect(renderToStaticMarkup(<NavigationTrail page="home" navigate={noop} />)).toBe('');
  });
  it('abre o formulário de envio existente e respeita criação não permitida', () => {
    const html = renderToStaticMarkup(<ShipmentsPage user={user} initialCreating />);
    expect(html).toContain('Adicionar produto');
    expect(html).toContain('Observação geral do envio');
    const denied = renderToStaticMarkup(<ShipmentsPage user={{ ...user, permissions: ['shipments.read'] }} initialCreating />);
    expect(denied).not.toContain('Adicionar produto');
    const history = renderToStaticMarkup(<ShipmentsPage user={user} initialView="history" showCreateAction={false} />);
    expect(history).not.toContain('Novo envio');
    expect(history).toContain('aria-pressed="true">Histórico');
  });
  it('predefine as consultas PCP sem mudar os filtros disponíveis', () => {
    const all = renderToStaticMarkup(<PcpPage initialStatus="" />);
    expect(all.match(/value="" selected=""/g)).toHaveLength(5);
    const executed = renderToStaticMarkup(<PcpPage initialStatus="EXECUTADA" />);
    expect(executed).toContain('value="EXECUTADA" selected=""');
    expect(executed).toContain('value="CONCLUIDA" selected=""');
  });
});
