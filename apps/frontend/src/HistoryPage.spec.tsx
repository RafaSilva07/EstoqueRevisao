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
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
    requestedPaths = [];
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    vi.spyOn(api, 'get').mockImplementation((path) => {
      requestedPaths.push(path);
      if (path.startsWith('/history?')) return Promise.resolve(result([item]));
      return Promise.resolve({ ...item, codigoMovimentacao: item.code, originSector: 'PRODUCAO', destinationSector: 'REVISAO', createdBy: { id: 'operator', username: 'Operador' }, createdAt: item.occurredAt, items: [] });
    });
  });
  afterEach(() => { act(() => { root.unmount(); }); host.remove(); vi.restoreAllMocks(); vi.useRealTimers(); });

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
    expect(host.querySelector('.movement-record-line')?.textContent).toContain('800001 · Produto A');
    await act(async () => { host.querySelector<HTMLButtonElement>('.movement-record-line-main')!.click(); await Promise.resolve(); });
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

  it('exporta os filtros em colunas por registro, todas as páginas e somente finalizadas', async () => {
    vi.useFakeTimers();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:history-export') });
    const revoke = vi.fn();
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke });
    let downloadedFile = '';
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { downloadedFile = this.download; });
    const download = vi.spyOn(api, 'getBlob').mockResolvedValue(new Blob(['"Registro";"Produto"\r\n'], { type: 'text/csv' }));
    await act(async () => { root.render(<HistoryPage user={user} onOpenShipment={vi.fn()} onOpenPcp={vi.fn()} />); await Promise.resolve(); });
    const setFilter = async (label: string, value: string) => {
      const select = Array.from(host.querySelectorAll('select')).find((field) => field.closest('label')?.textContent?.startsWith(label))!;
      await act(async () => { select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); await Promise.resolve(); });
    };
    await setFilter('Visualização', 'GROUP');
    await setFilter('Tipo', 'REVISAO');
    await setFilter('Sentido', 'INTERNAL');
    await setFilter('Ordenar', 'OLDEST');
    const button = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((field) => field.textContent === 'Exportar CSV')!;
    await act(async () => { button.click(); await Promise.resolve(); });
    const path = download.mock.calls[0][0];
    const params = new URLSearchParams(path.split('?')[1]);
    expect(path.startsWith('/history/export.csv?')).toBe(true);
    expect(params.get('view')).toBe('RECORD');
    expect(params.get('scope')).toBe('DONE');
    expect(params.get('type')).toBe('REVISAO');
    expect(params.get('direction')).toBe('INTERNAL');
    expect(params.get('sort')).toBe('OLDEST');
    expect(params.has('page')).toBe(false);
    expect(params.has('limit')).toBe(false);
    expect(click).toHaveBeenCalledTimes(1);
    expect(downloadedFile).toBe('historico-finalizadas.csv');
    await act(async () => { vi.advanceTimersByTime(1000); await Promise.resolve(); });
    expect(revoke).toHaveBeenCalledWith('blob:history-export');
  });

  it('não exporta pendências e exibe erro de exportação sem apagar a lista', async () => {
    const download = vi.spyOn(api, 'getBlob').mockRejectedValue(new Error('Não foi possível exportar.'));
    await act(async () => { root.render(<HistoryPage user={user} onOpenShipment={vi.fn()} onOpenPcp={vi.fn()} />); await Promise.resolve(); });
    const button = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((field) => field.textContent === 'Exportar CSV')!;
    const status = Array.from(host.querySelectorAll('select')).find((field) => field.closest('label')?.textContent?.startsWith('Status'))!;
    await act(async () => { status.value = 'PENDING_PCP'; status.dispatchEvent(new Event('change', { bubbles: true })); await Promise.resolve(); });
    expect(button.disabled).toBe(true);
    expect(host.textContent).toContain('Selecione o status Todos ou Finalizadas');
    await act(async () => { button.click(); await Promise.resolve(); });
    expect(download).not.toHaveBeenCalled();
    await act(async () => { status.value = 'DONE'; status.dispatchEvent(new Event('change', { bubbles: true })); await Promise.resolve(); });
    await act(async () => { button.click(); await Promise.resolve(); });
    expect(host.textContent).toContain('Não foi possível exportar.');
    expect(host.querySelectorAll('.history-card')).toHaveLength(1);
    expect(button.disabled).toBe(false);
  });

  it('impede downloads simultâneos enquanto a API prepara o arquivo', async () => {
    let fail!: (error: Error) => void;
    const download = vi.spyOn(api, 'getBlob').mockReturnValue(new Promise<Blob>((_resolve, reject) => { fail = reject; }));
    await act(async () => { root.render(<HistoryPage user={user} onOpenShipment={vi.fn()} onOpenPcp={vi.fn()} />); await Promise.resolve(); });
    const button = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((field) => field.textContent === 'Exportar CSV')!;
    await act(async () => { button.click(); button.click(); await Promise.resolve(); });
    expect(download).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe('Preparando CSV…');
    await act(async () => { fail(new Error('Cancelado')); await Promise.resolve(); });
    expect(button.disabled).toBe(false);
  });
});
