// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { api, Product } from './api';
import { ProductAutocomplete } from './ProductAutocomplete';

const corn: Product = { id: 'corn', code: '760001', name: 'MILHO VERDE PANAMÁ', defaultUnit: 'UN', active: true };
const peas: Product = { id: 'peas', code: '760003', name: 'ERVILHA PANAMÁ', defaultUnit: 'UN', active: true };

describe('pesquisa livre no seletor de produtos', () => {
  it.each(['catálogo', 'disponíveis'])('encontra SEL LEG PETITOSA ao digitar sel petito na lista de %s', async (mode) => {
    vi.useFakeTimers();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const products: Product[] = ['003375.00', '003375.10', '003375.20', '003375.90', '003375.94'].map((code) => ({
      id: code, code, name: `SEL LEG PETITOSA 24/170 (${code})`, defaultUnit: 'UN', active: true,
    }));
    const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
    const changed = vi.fn();
    const get = vi.spyOn(api, 'get').mockResolvedValue({ items: products });
    try {
      act(() => { root.render(<ProductAutocomplete availableProducts={mode === 'disponíveis' ? [...products, corn] : undefined} onChange={changed} />); });
      const input = host.querySelectorAll<HTMLInputElement>('[role=combobox]')[1];
      act(() => { input.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'sel petito'); input.dispatchEvent(new Event('input', { bubbles: true })); });
      await act(async () => { await vi.advanceTimersByTimeAsync(250); });
      expect(host.querySelectorAll('[role=option]')).toHaveLength(5);
      if (mode === 'catálogo') {
        const params = new URLSearchParams(get.mock.calls.at(-1)![0].split('?')[1]);
        expect(params.get('search')).toBe('sel petito'); expect(params.get('searchField')).toBe('name');
      } else expect(get).not.toHaveBeenCalled();
      act(() => { host.querySelectorAll<HTMLButtonElement>('[role=option]')[1].click(); });
      expect(changed).toHaveBeenLastCalledWith(products[1]);
      const inputs = host.querySelectorAll<HTMLInputElement>('[role=combobox]');
      expect(inputs[0].value).toBe(products[1].code); expect(inputs[1].value).toBe(products[1].name);
    } finally { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.useRealTimers(); }
  });
  it.each(['catálogo', 'disponíveis'])('permite pesquisar e selecionar por palavras fora da ordem na lista de %s', async (mode) => {
    vi.useFakeTimers();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
    const changed = vi.fn();
    const get = vi.spyOn(api, 'get').mockImplementation((path) => Promise.resolve({ items: new URLSearchParams(path.split('?')[1]).get('search') === 'panama' ? [corn, peas] : [corn] }));
    const typeName = async (value: string) => {
      const input = host.querySelectorAll<HTMLInputElement>('[role=combobox]')[1];
      act(() => { input.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); });
      await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    };
    try {
      act(() => { root.render(<ProductAutocomplete availableProducts={mode === 'disponíveis' ? [corn, peas] : undefined} onChange={changed} />); });
      await typeName('panama');
      expect(host.querySelectorAll('[role=option]')).toHaveLength(2);
      await typeName('panama verde');
      expect(host.querySelectorAll('[role=option]')).toHaveLength(1);
      if (mode === 'catálogo') {
        const params = new URLSearchParams(get.mock.calls.at(-1)![0].split('?')[1]);
        expect(params.get('search')).toBe('panama verde'); expect(params.get('searchField')).toBe('name');
        expect(params.get('active')).toBe('true');
      } else expect(get).not.toHaveBeenCalled();
      act(() => { host.querySelector<HTMLButtonElement>('[role=option]')!.click(); });
      expect(changed).toHaveBeenLastCalledWith(corn);
      const inputs = host.querySelectorAll<HTMLInputElement>('[role=combobox]');
      expect(inputs[0].value).toBe(corn.code); expect(inputs[1].value).toBe(corn.name);
    } finally { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.useRealTimers(); }
  });
});
