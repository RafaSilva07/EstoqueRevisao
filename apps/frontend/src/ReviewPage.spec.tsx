// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { ReviewPage } from './ReviewPage';

describe('revisão a partir de entrada aceita', () => {
  it('busca o produto/lote específico além da primeira página e abre só quantidade/distribuição', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
    const source = { id: 'source', name: 'Revisar', reviewRole: 'SOURCE', kind: 'INTERNAL', active: true };
    const position = { id: 'position', productId: 'product', batchId: 'batch', stockLocationId: 'source', quantity: 1000,
      product: { id: 'product', code: '005601.90', name: 'Produto X', defaultUnit: 'UN', active: true },
      batch: { id: 'batch', code: 'CICINV', manufacturingDate: '2026-09-09', expirationDate: '2029-09-09' }, stockLocation: source };
    const get = vi.spyOn(api, 'get').mockImplementation((path) => Promise.resolve(path.startsWith('/stocks?') ? { items: [source] }
      : path === '/settings/operational' ? { reviewDestinations: [{ id: 'good', name: 'Lata Boa', reviewRole: 'GOOD' }, { id: 'retail', name: 'Varejo' }, { id: 'tuf', name: 'TUF' }] }
        : { items: path.includes('productId=product&batchId=batch') ? [position] : [], meta: { totalPages: 1 } }));
    try {
      await act(async () => { root.render(<ReviewPage prefill={{ productId: 'product', batchId: 'batch' }} onCreated={() => undefined} />); await Promise.resolve(); });
      for (let index = 0; index < 40 && !host.querySelector('[role=dialog]'); index++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
      expect(get).toHaveBeenCalledWith('/stock-positions?limit=100&stockLocationId=source&productId=product&batchId=batch');
      const editor = host.querySelector('[role=dialog]')!;
      expect(editor.textContent).toContain('005601.90 - Produto X'); expect(editor.textContent).toContain('CICINV'); expect(editor.textContent).toContain('1000 UN');
      expect(editor.querySelector<HTMLInputElement>('input[type=number]')?.value).toBe('');
      expect(editor.textContent).toContain('Lata Boa'); expect(editor.textContent).toContain('Varejo'); expect(editor.textContent).toContain('TUF');
    } finally { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); }
  });
});
