// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';
import { ExternalExitPage } from './ExternalExitPage';

describe('saída externa com aviso de duplicidade', () => {
  it('mantém a confirmação e os itens para conferir antes de repetir a saída', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
    const created = vi.fn();
    const source = { id: 'source', code: 'REVISAR', name: 'Revisar', kind: 'SUBSTOCK', active: true };
    const destination = { id: 'destination', code: 'OTHER', name: 'Outro destino', kind: 'EXTERNAL', active: true };
    const position = { id: 'position', productId: 'product', batchId: 'batch', stockLocationId: 'source', quantity: 20,
      product: { id: 'product', code: '005601.90', name: 'Produto X', defaultUnit: 'UN', active: true },
      batch: { id: 'batch', code: 'CICINV', manufacturingDate: '2026-09-09', expirationDate: '2029-09-09' }, stockLocation: source };
    vi.spyOn(api, 'get').mockImplementation((path) => Promise.resolve({ items: path.startsWith('/stocks?') ? [source, destination] : [position] }));
    const post = vi.spyOn(api, 'post').mockRejectedValueOnce(new ApiError('Operação idêntica recente.', 'RECENT_DUPLICATE_CONFIRMATION_REQUIRED', {
      duplicateKeys: ['MOVEMENT:previous:signature'], duplicates: [{ id: 'previous', kind: 'MOVEMENT', code: 'SAI-000001', createdAt: '2026-10-08T13:00:00Z', responsible: 'Operador', status: 'EFETIVADA' }],
    })).mockResolvedValueOnce({ id: 'new' });
    const click = async (label: string) => { await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === label)!.click(); await Promise.resolve();
    }); };
    try {
      await act(async () => { root.render(<ExternalExitPage prefill={{ originLocationId: 'source', productId: 'product', batchId: 'batch' }} onCreated={created} />); await Promise.resolve(); });
      for (let index = 0; index < 40 && !host.querySelector('select'); index++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
      const select = [...host.querySelectorAll('select')].find((element) => element.parentElement?.textContent?.includes('Destino externo'))!;
      act(() => { select.value = 'destination'; select.dispatchEvent(new Event('change', { bubbles: true })); });
      await click('Adicionar produto');
      const quantity = host.querySelector<HTMLInputElement>('[role=dialog] input[type=number]')!;
      act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(quantity, '5'); quantity.dispatchEvent(new Event('input', { bubbles: true })); });
      await act(async () => { host.querySelector('[role=dialog] form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await Promise.resolve(); });
      await click('Revisar saida'); await click('Confirmar saída');
      expect(created).not.toHaveBeenCalled(); expect(post).toHaveBeenCalledTimes(1);
      expect(host.querySelector('[role=dialog]')?.textContent).toContain('SAI-000001');
      expect(host.querySelector('[role=dialog]')?.textContent).toContain('Produto X');
      await click('Conferi: continuar mesmo assim');
      expect(created).toHaveBeenCalledWith('new');
      expect(post.mock.calls[1][1]).toMatchObject({ confirmedDuplicateKeys: ['MOVEMENT:previous:signature'] });
    } finally { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); }
  });
});
