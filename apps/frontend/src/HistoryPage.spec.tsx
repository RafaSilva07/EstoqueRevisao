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

  it('aguarda a digitação terminar antes de consultar por código ou produto', async () => {
    await act(async () => { root.render(<HistoryPage user={user} onOpenShipment={vi.fn()} onOpenPcp={vi.fn()} />); await Promise.resolve(); });
    const search = host.querySelector<HTMLInputElement>('input[type="search"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(search, 'ENT');
      search.dispatchEvent(new Event('input', { bubbles: true }));
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(search, 'ENT-000152');
      search.dispatchEvent(new Event('input', { bubbles: true }));
      await Promise.resolve();
    });
    expect(requestedPaths.filter((path) => path.startsWith('/history?'))).toHaveLength(1);
    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 350)); });
    const historyPaths = requestedPaths.filter((path) => path.startsWith('/history?'));
    expect(historyPaths).toHaveLength(2);
    expect(historyPaths[1]).toContain('search=ENT-000152');
  });

  it('abre o registro individual e permite navegar para o grupo e outro filho', async () => {
    const child = { ...item, id: 'record-A', groupId: 'shipment-1', recordId: 'record-A',
      code: 'ENT-000152-A', groupCode: 'ENT-000152', productCode: '800001', productName: 'Produto A',
      productUnit: 'UN', batchCode: 'SOCDNV', quantity: 10, groupItemCount: 2 };
    const shipmentDetail = { ...item, id: 'shipment-1', codigoMovimentacao: 'ENT-000152', originSector: 'PRODUCAO',
      destinationSector: 'REVISAO', createdBy: { id: 'operator', username: 'Operador' }, createdAt: item.occurredAt,
      items: [
        { id: 'record-A', codigoRegistro: 'ENT-000152-A', quantity: 10, productSnapshot: { code: '800001', name: 'Produto A', defaultUnit: 'UN' }, batch: { code: 'SOCDNV', manufacturingDate: '2026-09-01', expirationDate: '2028-09-01' }, photoMimeType: null },
        { id: 'record-B', codigoRegistro: 'ENT-000152-B', quantity: 20, productSnapshot: { code: '800002', name: 'Produto B', defaultUnit: 'UN' }, batch: { code: 'SOCINV', manufacturingDate: '2026-09-02', expirationDate: '2028-09-02' }, photoMimeType: null },
      ],
    };
    vi.spyOn(api, 'get').mockImplementation((path) => {
      requestedPaths.push(path);
      if (path.startsWith('/history?')) return Promise.resolve(result(path.includes('view=GROUP') ? [item] : [child]));
      return Promise.resolve(shipmentDetail);
    });
    await act(async () => { root.render(<HistoryPage user={user} onOpenShipment={vi.fn()} onOpenPcp={vi.fn()} />); await Promise.resolve(); });
    expect(requestedPaths[0]).toContain('view=RECORD');
    expect(host.querySelector('.history-card')?.textContent).toContain('ENT-000152-A');
    await act(async () => { host.querySelector<HTMLButtonElement>('.history-card')!.click(); await Promise.resolve(); });
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('Produto A');
    expect(host.querySelector('[role="dialog"]')?.textContent).not.toContain('Produto B');
    await act(async () => { Array.from(host.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).find((button) => button.textContent?.includes('Ver grupo'))!.click(); await Promise.resolve(); });
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('Produto B');
    await act(async () => { Array.from(host.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).find((button) => button.textContent?.includes('ENT-000152-B'))!.click(); await Promise.resolve(); });
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('Produto B');
    expect(host.querySelector('[role="dialog"]')?.textContent).not.toContain('Produto A');
    const view = Array.from(host.querySelectorAll('select')).find((select) => select.closest('label')?.textContent?.includes('Visualização'))!;
    await act(async () => { view.value = 'GROUP'; view.dispatchEvent(new Event('change', { bubbles: true })); await Promise.resolve(); });
    expect(requestedPaths.some((path) => path.includes('view=GROUP'))).toBe(true);
  });
});
