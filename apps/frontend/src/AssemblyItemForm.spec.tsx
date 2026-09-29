// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, Product, StockPosition } from './api';
import { AssemblyItemForm } from './AssemblyItemForm';

vi.mock('./ProductAutocomplete', () => ({
  ProductAutocomplete: ({ onChange }: { onChange: (product: Product) => void }) =>
    <button type="button" onClick={() => onChange({ id: 'unit-id', code: '500001', name: 'Produto UN', defaultUnit: 'UN', active: true })}>Selecionar UN</button>,
}));

let host: HTMLDivElement;
let root: Root;
describe('Formulário de montagem no envio', () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    vi.spyOn(api, 'get').mockResolvedValue({ packages: [{ id: 'package-id', code: '500002', name: 'Fardo', defaultUnit: 'FD', unitsPerPackage: 10, active: true }],
      availableUnits: 27,
      availableByBatch: [
        { batchId: 'batch-a', code: 'LOTE-A', manufacturingDate: '2026-08-31', expirationDate: '2028-08-31', availableUnits: 12,
          positions: [{ positionId: 'lata-boa-a', stockLocationName: 'Lata Boa', availableUnits: 11 },
            { positionId: 'tuf-a', stockLocationName: 'TUF', availableUnits: 1 }] },
        { batchId: 'batch-b', code: 'LOTE-B', manufacturingDate: '2026-09-01', expirationDate: '2028-09-01', availableUnits: 15,
          positions: [{ positionId: 'lata-boa-b', stockLocationName: 'Lata Boa', availableUnits: 15 }] },
      ],
      positions: { items: [], meta: { page: 1, limit: 20, total: 0, totalPages: 1 } } });
  });
  afterEach(() => {
    act(() => { root.unmount(); }); host.remove(); vi.restoreAllMocks();
  });
  it('sugere embalagens por data no modo comum e pelo total apenas no Lote 0', async () => {
    const getSpy = vi.spyOn(api, 'get');
    act(() => { root.render(<AssemblyItemForm onAdd={vi.fn()} excludedPositions={[]} />); });
    await act(async () => { host.querySelector('button')!.click(); await Promise.resolve(); });
    const option = host.querySelector('option[value="package-id"]');
    expect(option?.textContent).toContain('10 UN');
    act(() => { const select = host.querySelector('select')!; select.value = 'package-id'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    const suggestions = host.querySelectorAll('.assembly-batch-option');
    expect(suggestions).toHaveLength(2);
    expect(suggestions[0].textContent).toContain('31/08/2026');
    expect(suggestions[0].textContent).toContain('até 1 FD');
    expect(suggestions[0].textContent).toContain('Lata Boa: 11 UN · até 1 FD nesta posição');
    expect(suggestions[0].textContent).toContain('TUF: 1 UN · até 0 FD nesta posição');
    expect(suggestions[1].textContent).toContain('01/09/2026');
    expect(suggestions[1].textContent).toContain('Lata Boa: 15 UN · até 1 FD nesta posição');
    expect(host.textContent).not.toContain('até 2 FD');
    await act(async () => { (suggestions[0] as HTMLButtonElement).click(); await Promise.resolve(); });
    expect(getSpy).toHaveBeenCalledWith(expect.stringContaining('batchId=batch-a'));
    expect(host.querySelector<HTMLInputElement>('input[max="1"]')).not.toBeNull();
    await act(async () => {
      const checkbox = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
      checkbox.click();
      await Promise.resolve();
    });
    expect(host.querySelectorAll('.assembly-batch-option')).toHaveLength(0);
    expect(host.textContent).toContain('Total disponível para Lote 0: 27 UN');
    expect(host.textContent).toContain('até 2 FD');
  });

  it('desconta uma posição já usada neste envio sem esconder as outras do lote', async () => {
    const excluded = { id: 'lata-boa-a', productId: 'unit-id', batchId: 'batch-a', quantity: 11 } as StockPosition;
    act(() => { root.render(<AssemblyItemForm onAdd={vi.fn()} excludedPositions={[excluded]} />); });
    await act(async () => { host.querySelector('button')!.click(); await Promise.resolve(); });
    act(() => { const select = host.querySelector('select')!; select.value = 'package-id'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    const suggestions = host.querySelectorAll('.assembly-batch-option');
    expect(suggestions[0].textContent).toContain('Total do lote: 1 UN · até 0 FD');
    expect(suggestions[0].textContent).toContain('Lata Boa: 0 UN · até 0 FD nesta posição');
    expect(suggestions[0].textContent).toContain('TUF: 1 UN · até 0 FD nesta posição');
    expect((suggestions[0] as HTMLButtonElement).disabled).toBe(true);
    expect(suggestions[1].textContent).toContain('Lata Boa: 15 UN · até 1 FD nesta posição');
  });
});
