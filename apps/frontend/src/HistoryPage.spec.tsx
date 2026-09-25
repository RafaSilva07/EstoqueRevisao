// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, UserSession } from './api';
import { HistoryPage } from './HistoryPage';

const user: UserSession = { id: 'operator', username: 'Operador', sector: 'REVISAO', roles: ['REVISAO'], permissions: ['shipments.read', 'movements.read'] };
const item = { id: 'shipment-1', kind: 'SHIPMENT', code: 'ENT-000152', type: 'ENVIO', origin: 'Produção', destination: 'Revisão', responsible: 'Operador', occurredAt: '2026-09-01T12:00:00Z', status: 'AGUARDANDO_RECEBIMENTO', scope: 'OPEN', itemCount: 2 };
let host: HTMLDivElement; let root: Root;
let requestedPaths: string[];
const result = (items: unknown[]) => ({ items, meta: { total: items.length, page: 1, limit: 20, totalPages: 1 } });

describe('Histórico unificado', () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    requestedPaths = [];
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    vi.spyOn(api, 'get').mockImplementation((path) => {
      requestedPaths.push(path);
      if (path.startsWith('/history?')) return Promise.resolve(result([item]));
      return Promise.resolve({ ...item, codigoMovimentacao: item.code, originSector: 'PRODUCAO', destinationSector: 'REVISAO', createdBy: { id: 'operator', username: 'Operador' }, createdAt: item.occurredAt, items: [] });
    });
  });
  afterEach(() => { act(() => { root.unmount(); }); host.remove(); vi.restoreAllMocks(); });

  it('mostra um cartão, aplica status na API e abre o envio existente', async () => {
    await act(async () => { root.render(<HistoryPage user={user} onOpenShipment={vi.fn()} onOpenPcp={vi.fn()} />); await Promise.resolve(); });
    expect(host.querySelectorAll('.history-card')).toHaveLength(1);
    const status = Array.from(host.querySelectorAll('select')).find((select) => select.closest('label')?.textContent?.includes('Status'))!;
    await act(async () => { status.value = 'DONE'; status.dispatchEvent(new Event('change', { bubbles: true })); await Promise.resolve(); });
    expect(requestedPaths.some((path) => path.includes('scope=DONE'))).toBe(true);
    await act(async () => { host.querySelector<HTMLButtonElement>('.history-card')!.click(); await Promise.resolve(); });
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('ENT-000152');
  });

  it('separa entrada líquida e retorno e filtra pelo sentido do setor', async () => {
    const entry = { ...item, id: 'movement-1', kind: 'MOVEMENT', type: 'ENTRADA_EXTERNA', direction: 'INCOMING', parentCode: 'ENT-000152' };
    const returned = { ...item, id: 'return-1', code: 'SAI-000153', direction: 'OUTGOING', parentCode: 'ENT-000152' };
    vi.spyOn(api, 'get').mockImplementation((path) => {
      requestedPaths.push(path);
      if (path.startsWith('/history?')) return Promise.resolve(result([entry, returned]));
      return Promise.resolve({ ...item, codigoMovimentacao: item.code, originSector: 'PRODUCAO', destinationSector: 'REVISAO', createdBy: { id: 'operator', username: 'Operador' }, createdAt: item.occurredAt, items: [] });
    });
    await act(async () => { root.render(<HistoryPage user={user} onOpenShipment={vi.fn()} onOpenPcp={vi.fn()} />); await Promise.resolve(); });
    expect(host.querySelectorAll('.history-card')).toHaveLength(2);
    expect(host.textContent).toContain('Parte do envio original ENT-000152');
    expect(Array.from(host.querySelectorAll('.history-card')).every((card) => !card.textContent?.includes('meu setor'))).toBe(true);
    const direction = Array.from(host.querySelectorAll('select')).find((select) => select.closest('label')?.textContent?.includes('Sentido'))!;
    await act(async () => { direction.value = 'INCOMING'; direction.dispatchEvent(new Event('change', { bubbles: true })); await Promise.resolve(); });
    expect(requestedPaths.some((path) => path.includes('direction=INCOMING'))).toBe(true);
  });
});
