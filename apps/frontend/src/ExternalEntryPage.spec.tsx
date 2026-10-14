// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, StockLocation } from './api';
import { ExternalEntryPage } from './ExternalEntryPage';

const location = (id: string, name: string, kind: StockLocation['kind'], sector: string | null = null) =>
  ({ id, name, code: id, kind, sector, active: true }) as StockLocation;
const result = (items: unknown[]) => ({ items, meta: { total: items.length, page: 1, limit: 100, totalPages: 1 } });
let host: HTMLDivElement;
let root: Root;
const onManageLocations = vi.fn();

async function render(origins: StockLocation[]) {
  vi.spyOn(api, 'get').mockImplementation(async (path) => {
    await Promise.resolve();
    if (path.includes('kind=EXTERNAL')) return result(origins);
    if (path.startsWith('/stocks?')) return result([location('review', 'Revisar', 'SUBSTOCK')]);
    return result([]);
  });
  await act(async () => { root.render(<ExternalEntryPage onCreated={() => undefined} onManageLocations={onManageLocations} />); await Promise.resolve(); });
}

describe('origem da entrada manual', () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  });
  afterEach(async () => { await act(async () => { root.unmount(); await Promise.resolve(); }); host.remove(); vi.restoreAllMocks(); vi.clearAllMocks(); });

  it('permite selecionar origens externas comuns e setores na entrada manual', async () => {
    await render([location('supplier', 'Fornecedor', 'EXTERNAL'), location('production', 'Produção', 'EXTERNAL', 'PRODUCAO'),
      location('expedition', 'Expedição', 'EXTERNAL', 'EXPEDICAO')]);
    const origin = Array.from(host.querySelectorAll('select')).find((select) => select.parentElement?.textContent?.includes('Origem externa'));
    expect(origin?.textContent).toContain('Fornecedor');
    expect(origin?.textContent).toContain('Produção');
    expect(origin?.textContent).toContain('Expedição');
    expect(host.textContent).toContain('credita o estoque imediatamente');
    expect(host.textContent).not.toContain('Não há origem externa ativa cadastrada');
  });

  it('orienta o cadastro quando não existe origem manual disponível', async () => {
    await render([]);
    expect(host.textContent).toContain('Não há origem externa ativa cadastrada');
    const button = Array.from(host.querySelectorAll('button')).find((item) => item.textContent === 'Cadastrar origem externa');
    expect(button).toBeTruthy();
    await act(async () => { button!.click(); await Promise.resolve(); });
    expect(onManageLocations).toHaveBeenCalledOnce();
  });
  it('pesquisa no catálogo e seleciona produto fora de qualquer primeira página pré-carregada', async () => {
    const product = { id: 'outside-first-page', code: '760001', name: 'MILHO VERDE PANAMÁ', defaultUnit: 'UN', active: true, shelfLifeYears: 3 };
    const get = vi.spyOn(api, 'get').mockImplementation((path) => Promise.resolve(path.startsWith('/products?')
      ? result([product]) : path.includes('kind=EXTERNAL') ? result([location('supplier', 'Fornecedor', 'EXTERNAL')]) : result([location('review', 'Revisar', 'SUBSTOCK')])));
    await act(async () => { root.render(<ExternalEntryPage onCreated={() => undefined} />); await Promise.resolve(); });
    act(() => { [...host.querySelectorAll('button')].find((button) => button.textContent === 'Adicionar produto')!.click(); });
    const input = host.querySelectorAll<HTMLInputElement>('[role=combobox]')[1];
    act(() => { input.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'panama verde'); input.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 260)); });
    act(() => { host.querySelector<HTMLButtonElement>('[role=option]')!.click(); });
    expect(host.querySelectorAll<HTMLInputElement>('[role=combobox]')[0].value).toBe(product.code);
    expect(host.querySelector('[role=dialog]')?.textContent).toContain('Quantidade (UN)');
    const requests = get.mock.calls.map(([path]) => path);
    expect(requests.some((path) => path.startsWith('/products?') && path.includes('search=panama+verde'))).toBe(true);
    expect(requests.some((path) => path.startsWith('/products?') && path.includes('limit=100'))).toBe(false);
  });
});
