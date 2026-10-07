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

const position = (id: string, batchId: string, code: string, locationCode: string, locationName: string, quantity: number): StockPosition => ({
  id, productId: 'unit-id', batchId, stockLocationId: locationCode, quantity,
  product: { id: 'unit-id', code: '500001', name: 'Produto UN', defaultUnit: 'UN', active: true },
  batch: { id: batchId, productId: 'unit-id', code, manufacturingDate: batchId === 'batch-a' ? '2026-08-31' : '2026-09-01', expirationDate: batchId === 'batch-a' ? '2028-08-31' : '2028-09-01' },
  stockLocation: { id: locationCode, code: locationCode, name: locationName, description: null, kind: 'STOCK', displayMode: 'LOTS', parentId: null, active: true, reviewRole: null },
  createdAt: '', updatedAt: '',
});
const positions = [
  position('lata-boa-a', 'batch-a', 'LOTE-A', 'LATA_BOA', 'Lata Boa', 11),
  position('lata-boa-b', 'batch-b', 'LOTE-B', 'LATA_BOA', 'Lata Boa', 15),
  position('tuf-a', 'batch-a', 'LOTE-A', 'TUF', 'TUF', 1),
];

let host: HTMLDivElement;
let root: Root;
let onAdd: ReturnType<typeof vi.fn>;
let getCalls: string[];

async function chooseUnitAndPackage() {
  await act(async () => { [...host.querySelectorAll('button')].find((button) => button.textContent === 'Selecionar UN')!.click(); await Promise.resolve(); });
  act(() => {
    const select = host.querySelector('select')!;
    select.value = 'package-id';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function selectPosition(lot: string, location: string) {
  await act(async () => {
    const checkbox = [...host.querySelectorAll<HTMLInputElement>('.assembly-source input[type="checkbox"]')]
      .find((item) => item.closest('.assembly-source')?.textContent?.includes(`lote ${lot}`)
        && item.closest('.assembly-source')?.textContent?.includes(`${location} · lote`))!;
    checkbox.click();
    await Promise.resolve();
  });
}

function setNumber(label: string, value: string) {
  act(() => {
    const input = [...host.querySelectorAll<HTMLInputElement>('input[type="number"]')]
      .find((item) => item.closest('label')?.textContent?.includes(label))!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function submit() {
  await act(async () => { host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await Promise.resolve(); });
}

describe('Formulário de montagem no envio', () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    Element.prototype.scrollIntoView = vi.fn();
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    onAdd = vi.fn();
    getCalls = [];
    vi.spyOn(api, 'get').mockImplementation((url) => {
      getCalls.push(url);
      const batchId = new URLSearchParams(url.split('?')[1]).get('batchId');
      const items = batchId ? positions.filter((item) => item.batchId === batchId) : positions;
      return Promise.resolve({ packages: [{ id: 'package-id', code: '500002', name: 'Fardo', defaultUnit: 'FD', unitsPerPackage: 10, active: true }],
        availableUnits: 27,
        availableByBatch: [
          { batchId: 'batch-a', code: 'LOTE-A', manufacturingDate: '2026-08-31', expirationDate: '2028-08-31', availableUnits: 12,
            positions: [{ positionId: 'lata-boa-a', stockLocationName: 'Lata Boa', availableUnits: 11 }, { positionId: 'tuf-a', stockLocationName: 'TUF', availableUnits: 1 }] },
          { batchId: 'batch-b', code: 'LOTE-B', manufacturingDate: '2026-09-01', expirationDate: '2028-09-01', availableUnits: 15,
            positions: [{ positionId: 'lata-boa-b', stockLocationName: 'Lata Boa', availableUnits: 15 }] },
        ], positions: { items, meta: { page: 1, limit: 20, total: items.length, totalPages: 1 } } });
    });
    act(() => { root.render(<AssemblyItemForm onAdd={onAdd} excludedPositions={[]} />); });
  });
  afterEach(() => { act(() => { root.unmount(); }); host.remove(); vi.restoreAllMocks(); });

  it('mostra Lata Boa diretamente e retira de uma posição somente as UN necessárias', async () => {
    await chooseUnitAndPackage();
    expect(host.querySelectorAll('.assembly-source')).toHaveLength(2);
    expect(host.textContent).not.toContain('Total do lote');
    expect(host.textContent).not.toContain('TUF · lote');
    expect(host.textContent).toContain('até 1 FD nesta posição');
    await selectPosition('LOTE-A', 'Lata Boa');
    expect(getCalls.some((url) => url.includes('batchId=batch-a'))).toBe(true);
    setNumber('Quantidade de FD', '1');
    expect(host.textContent).toContain('10 UN desta posição');
    expect(host.querySelectorAll('.assembly-source-quantity input')).toHaveLength(0);
    await submit();
    expect(onAdd).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ sources: [{ position: positions[0], quantity: 10 }] }), '');
  });

  it('exibe rateio ao marcar mais de uma posição do lote', async () => {
    await chooseUnitAndPackage();
    await selectPosition('LOTE-A', 'Lata Boa');
    setNumber('Quantidade de FD', '1');
    act(() => { host.querySelector<HTMLButtonElement>('.assembly-more')!.click(); });
    expect(host.textContent).toContain('TUF · lote LOTE-A');
    await selectPosition('LOTE-A', 'TUF');
    expect(host.querySelectorAll('.assembly-source-quantity input')).toHaveLength(2);
    setNumber('UN desta posição', '9');
    const inputs = host.querySelectorAll<HTMLInputElement>('.assembly-source-quantity input');
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(inputs[1], '1');
      inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
    });
    await submit();
    expect(onAdd).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ sources: [
      { position: positions[0], quantity: 9 }, { position: positions[2], quantity: 1 },
    ] }), '');
  });

  it('mantém o total apenas no Lote 0 e bloqueia posição sem saldo suficiente', async () => {
    await chooseUnitAndPackage();
    await act(async () => { host.querySelector<HTMLInputElement>('.assembly-mixed-toggle input')!.click(); await Promise.resolve(); });
    expect(host.textContent).toContain('Total disponível para Lote 0: 27 UN');
    expect(host.textContent).toContain('até 2 FD');
    await act(async () => { host.querySelector<HTMLInputElement>('.assembly-mixed-toggle input')!.click(); await Promise.resolve(); });
    act(() => { host.querySelector<HTMLButtonElement>('.assembly-more')!.click(); });
    await selectPosition('LOTE-A', 'TUF');
    setNumber('Quantidade de FD', '1');
    await submit();
    expect(onAdd).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Distribua exatamente 10 UN');
  });

  it('mantém a montagem de Lote 0 com parcelas de datas diferentes', async () => {
    await chooseUnitAndPackage();
    await act(async () => { host.querySelector<HTMLInputElement>('.assembly-mixed-toggle input')!.click(); await Promise.resolve(); });
    await selectPosition('LOTE-A', 'Lata Boa');
    await selectPosition('LOTE-B', 'Lata Boa');
    setNumber('Quantidade de FD', '2');
    const inputs = host.querySelectorAll<HTMLInputElement>('.assembly-source-quantity input');
    act(() => {
      for (const input of inputs) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '10');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await submit();
    expect(onAdd).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ mixedDates: true, packageQuantity: 2, sources: [
      { position: positions[0], quantity: 10 }, { position: positions[1], quantity: 10 },
    ] }), '');
  });

  it('desabilita uma posição já usada neste envio', async () => {
    act(() => { root.render(<AssemblyItemForm onAdd={onAdd} excludedPositions={[positions[0]]} />); });
    await chooseUnitAndPackage();
    const first = host.querySelector<HTMLInputElement>('.assembly-source input[type="checkbox"]')!;
    expect(first.disabled).toBe(true);
    expect(first.closest('.assembly-source')?.textContent).toContain('já usado neste envio');
  });
});
