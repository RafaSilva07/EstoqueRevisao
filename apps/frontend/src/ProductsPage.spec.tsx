// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { api, Paginated, Product } from './api';
import { ProductsPage } from './App';

let host: HTMLDivElement;
let root: Root;
let catalog: Product[];
let requestedPaths: string[];
let getProducts: Mock<(path: string) => Promise<Paginated<Product>>>;

function queryResult(path: string): Paginated<Product> {
  const params = new URLSearchParams(path.split('?')[1]);
  const page = Number(params.get('page') ?? 1);
  const limit = Number(params.get('limit') ?? 20);
  const search = (params.get('search') ?? '').toLowerCase();
  const filtered = catalog.filter((product) => `${product.code} ${product.name}`.toLowerCase().includes(search));
  return {
    items: filtered.slice((page - 1) * limit, page * limit),
    meta: { page, limit, total: filtered.length, totalPages: Math.ceil(filtered.length / limit) },
  };
}

function button(label: string): HTMLButtonElement {
  const match = Array.from(host.querySelectorAll('button')).find((candidate) => candidate.textContent === label);
  expect(match).toBeTruthy();
  return match!;
}

function changeInput(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function settle() {
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
}

async function render(canWrite = false) {
  act(() => { root.render(<ProductsPage canWrite={canWrite} canManageStatus={false} canReadConversions={false} />); });
  await settle();
}

async function click(label: string) {
  act(() => { button(label).click(); });
  await settle();
}

describe('Paginação de produtos', () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.useFakeTimers();
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 100, bottom: 110 } as DOMRect);
    catalog = Array.from({ length: 45 }, (_, index) => {
      const code = String(index + 1).padStart(6, '0');
      return { id: code, code, name: `Produto ${code}`, defaultUnit: 'UN', unitWeightGrams: 200, shelfLifeYears: 3, active: true };
    });
    requestedPaths = [];
    getProducts = vi.fn((path: string) => {
      requestedPaths.push(path);
      return Promise.resolve(queryResult(path));
    });
    vi.spyOn(api, 'get').mockImplementation(getProducts);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    host.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('consulta somente uma página, exibe totais da API e navega respeitando os limites', async () => {
    act(() => { root.render(<ProductsPage canWrite={false} canManageStatus={false} canReadConversions={false} />); });
    expect(host.textContent).toContain('Carregando produtos');
    expect(getProducts).not.toHaveBeenCalled();
    await settle();
    expect(requestedPaths).toEqual(['/products?page=1&limit=20&search=']);
    expect(host.querySelectorAll('tbody tr')).toHaveLength(20);
    expect(host.querySelector('[aria-label="Paginação de produtos"]')?.textContent).toContain('Página 1 de 3 · 45 produtos');
    expect(button('Anterior').disabled).toBe(true);

    await click('Próxima');
    expect(requestedPaths.at(-1)).toBe('/products?page=2&limit=20&search=');
    expect(host.querySelector('tbody')?.textContent).toContain('000021');
    expect(host.querySelector('tbody')?.textContent).not.toContain('000001');
    await click('Próxima');
    expect(host.querySelectorAll('tbody tr')).toHaveLength(5);
    expect(button('Próxima').disabled).toBe(true);
    await click('Anterior');
    expect(host.querySelector('[aria-label="Paginação de produtos"]')?.textContent).toContain('Página 2 de 3');
  });

  it('reinicia a página ao buscar e preserva a busca nas páginas seguintes', async () => {
    await render();
    await click('Próxima');
    act(() => { changeInput(host.querySelector('input[type="search"]')!, 'Produto'); });
    await settle();
    expect(requestedPaths.at(-1)).toBe('/products?page=1&limit=20&search=Produto');
    await click('Próxima');
    expect(requestedPaths.at(-1)).toBe('/products?page=2&limit=20&search=Produto');
    act(() => { changeInput(host.querySelector('input[type="search"]')!, '00004'); });
    await settle();
    expect(host.querySelectorAll('tbody tr')).toHaveLength(7);
    expect(host.querySelector('[aria-label="Paginação de produtos"]')?.textContent).toContain('Página 1 de 1 · 7 produtos');
    expect(button('Próxima').disabled).toBe(true);
  });

  it('reinicia a navegação ao mudar a quantidade por página', async () => {
    await render();
    await click('Próxima');
    const limit = host.querySelector('select')!;
    act(() => { limit.value = '50'; limit.dispatchEvent(new Event('change', { bubbles: true })); });
    await settle();
    expect(requestedPaths.at(-1)).toBe('/products?page=1&limit=50&search=');
    expect(host.querySelectorAll('tbody tr')).toHaveLength(45);
    expect(button('Próxima').disabled).toBe(true);
    expect(Array.from(limit.options).map((option) => option.value)).toEqual(['20', '50', '100']);
  });

  it('não deixa resposta antiga substituir os resultados da busca atual', async () => {
    let resolveInitial!: (result: Paginated<Product>) => void;
    const initialResponse = new Promise<Paginated<Product>>((resolve) => { resolveInitial = resolve; });
    getProducts.mockImplementationOnce(() => initialResponse);
    await render();
    expect(host.textContent).toContain('Carregando produtos');
    act(() => { changeInput(host.querySelector('input[type="search"]')!, 'Produto 000045'); });
    await settle();
    expect(host.querySelectorAll('tbody tr')).toHaveLength(1);
    await act(async () => { resolveInitial(queryResult('/products?page=1&limit=20')); await Promise.resolve(); });
    expect(host.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(host.querySelector('tbody')?.textContent).toContain('000045');
    expect(host.querySelector('[aria-label="Paginação de produtos"]')?.textContent).toContain('1 produtos');
  });

  it('mostra erro sem resultados antigos e permite tentar a mesma página novamente', async () => {
    await render();
    getProducts.mockRejectedValueOnce(new Error('Não foi possível consultar os produtos.'));
    await click('Próxima');
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Não foi possível consultar os produtos.');
    expect(host.querySelector('tbody')).toBeNull();
    expect(host.querySelector('[aria-label="Paginação de produtos"]')).toBeNull();
    await click('Tentar novamente');
    expect(requestedPaths.at(-1)).toBe('/products?page=2&limit=20&search=');
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.querySelector('tbody')?.textContent).toContain('000021');
  });

  it('corrige a página que deixa de existir após editar um produto sob filtro', async () => {
    catalog = catalog.slice(0, 21);
    const updateProduct = vi.fn((path: string, body: unknown) => {
      const product = catalog.find((candidate) => path === `/products/${candidate.id}`)!;
      const payload = body as { name: string };
      const saved = { ...product, name: payload.name };
      catalog = catalog.map((candidate) => candidate.id === saved.id ? saved : candidate);
      return Promise.resolve(saved);
    });
    vi.spyOn(api, 'patch').mockImplementation(updateProduct);
    await render(true);
    act(() => { changeInput(host.querySelector('input[type="search"]')!, 'Produto'); });
    await settle();
    await click('Próxima');
    await click('Editar');
    const form = host.querySelector<HTMLFormElement>('[role="dialog"] form')!;
    act(() => { changeInput(form.querySelector('input[name="name"]')!, 'Outro nome'); });
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await vi.advanceTimersByTimeAsync(600); });
    await settle();
    expect(updateProduct).toHaveBeenCalledWith('/products/000021', expect.objectContaining({ name: 'Outro nome' }));
    expect(requestedPaths.slice(-2)).toEqual(['/products?page=2&limit=20&search=Produto', '/products?page=1&limit=20&search=Produto']);
    expect(host.querySelectorAll('tbody tr')).toHaveLength(20);
    expect(host.querySelector('[aria-label="Paginação de produtos"]')?.textContent).toContain('Página 1 de 1 · 20 produtos');
  });

  it('mostra o estado vazio sem páginas inexistentes', async () => {
    await render();
    act(() => { changeInput(host.querySelector('input[type="search"]')!, 'Não cadastrado'); });
    await settle();
    expect(host.textContent).toContain('Nenhum produto encontrado');
    expect(host.querySelector('[aria-label="Paginação de produtos"]')).toBeNull();
  });

  it('evita trocar a consulta enquanto uma alteração de produto está em andamento', async () => {
    catalog[0] = { ...catalog[0], active: false };
    let resolveUpdate!: (product: Product) => void;
    const pendingUpdate = new Promise<Product>((resolve) => { resolveUpdate = resolve; });
    vi.spyOn(api, 'patch').mockImplementation(() => pendingUpdate);
    await render(true);
    act(() => { button('Reativar').click(); });
    expect(host.querySelector<HTMLInputElement>('input[type="search"]')?.disabled).toBe(true);
    expect(host.querySelector('select')?.disabled).toBe(true);
    expect(button('Próxima').disabled).toBe(true);
    await act(async () => { resolveUpdate({ ...catalog[0], active: true }); await vi.advanceTimersByTimeAsync(10); });
    await settle();
    expect(host.querySelector<HTMLInputElement>('input[type="search"]')?.disabled).toBe(false);
    expect(button('Próxima').disabled).toBe(false);
  });
});
