// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, StockLocation } from './api';
import { StockProductResults, StockReportsPage } from './StockReportsPage';

describe('Estoque por produto', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('mostra total recebido da API e mantém as validades distintas no detalhe', () => {
    const html = renderToStaticMarkup(<StockProductResults items={[{
      productId: 'product-1', productCode: '123456', productName: 'Produto', unit: 'UN', quantity: 12,
      positions: [
        { positionId: 'position-1', productId: 'product-1', productCode: '123456', productName: 'Produto', batchCode: 'LOTE01', manufacturingDate: '2026-09-01', expirationDate: '2027-09-01', location: 'Revisar', quantity: 5, unit: 'UN', expirationStatus: 'VALIDO' },
        { positionId: 'position-2', productId: 'product-1', productCode: '123456', productName: 'Produto', batchCode: 'LOTE01', manufacturingDate: '2026-09-01', expirationDate: '2028-09-01', location: 'Revisar', quantity: 7, unit: 'UN', expirationStatus: 'VALIDO' },
      ],
    }]} />);
    expect(html).toContain('12 UN');
    expect(html).toContain('01/09/2027');
    expect(html).toContain('01/09/2028');
    expect(html).toContain('Ver lotes, validades e posições');
  });

  it('alterna Todos, Geral do estoque pai e um local filho sem misturar os filtros', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const parent = { id: 'parent-1', code: 'EST', name: 'Estoque Revisão', kind: 'STOCK', parentId: null, displayMode: 'PRODUCTS', active: true } as StockLocation;
    const child = { id: 'child-1', code: 'REVISAR', name: 'Revisar', kind: 'SUBSTOCK', parentId: parent.id, displayMode: 'LOTS', active: true } as StockLocation;
    const calls: string[] = [];
    vi.spyOn(api, 'get').mockImplementation((path) => {
      calls.push(path);
      if (path.startsWith('/stocks?')) return Promise.resolve({ items: [parent, child], meta: { total: 2, page: 1, limit: 100, totalPages: 1 } });
      return Promise.resolve({ items: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 }, totals: { positions: 0, quantityByUnit: [] } });
    });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const settle = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 15)); }); };
    const select = async (group: string, label: string) => {
      const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>(`.stock-location-tabs[aria-label="${group}"] button`));
      const button = buttons.find((candidate) => candidate.textContent === label);
      expect(button).toBeTruthy();
      act(() => { button!.click(); });
      await settle();
    };
    try {
      act(() => { root.render(<StockReportsPage />); });
      await settle();
      expect(host.querySelector('[aria-label="Estoque principal"]')?.textContent).toContain('Todos');
      expect(host.querySelector('[aria-label="Estoque principal"]')?.textContent).not.toContain('Revisar');
      expect(host.querySelector('.stock-child-picker')).toBeNull();

      await select('Estoque principal', parent.name);
      expect(host.querySelector('.stock-child-picker')?.textContent).toContain('Geral');
      expect(host.querySelector('.stock-child-picker')?.textContent).toContain(child.name);
      expect(calls.some((path) => path.startsWith('/reports/stock/products?') && path.includes('stockLocationId=parent-1') && path.includes('includeSubstocks=true'))).toBe(true);

      await select(`Local em ${parent.name}`, child.name);
      expect(calls.some((path) => path.startsWith('/reports/stock?') && path.includes('stockLocationId=child-1') && !path.includes('includeSubstocks'))).toBe(true);

      await select(`Local em ${parent.name}`, 'Geral');
      expect(host.querySelector(`.stock-child-picker button[aria-pressed="true"]`)?.textContent).toBe('Geral');
      await select('Estoque principal', 'Todos');
      expect(host.querySelector('.stock-child-picker')).toBeNull();
      expect(calls.at(-1)).toMatch(/^\/reports\/stock\?/);
      expect(calls.at(-1)).not.toContain('stockLocationId');
    } finally {
      act(() => { root.unmount(); });
      host.remove();
    }
  });
});
