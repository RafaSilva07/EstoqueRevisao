// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, UserSession } from './api';
import { Shipment } from './shipments';
import { ShipmentsPage } from './ShipmentsPage';

const user: UserSession = { id: 'receiver', username: 'Revisão', sector: 'REVISAO', roles: ['REVISAO'], permissions: ['shipments.read', 'shipments.decide'] };
const shipment = {
  id: 'shipment-1', codigoMovimentacao: 'ENT-000001', originSector: 'EXPEDICAO', destinationSector: 'REVISAO',
  status: 'EM_SEPARACAO', shipmentKind: 'NORMAL', createdBy: { id: 'sender', username: 'Expedição' },
  createdAt: '2026-10-06T12:00:00Z', movements: [],
  items: [
    { id: 'item-a', productSnapshot: { code: '005601.96', name: 'Produto', defaultUnit: 'FD' }, quantity: 30,
      batch: { code: 'CICINV', manufacturingDate: '2026-09-09', expirationDate: '2029-09-09' }, photoMimeType: null,
      separationDraft: { returnQuantity: 12 } },
    { id: 'item-b', productSnapshot: { code: '005601.96', name: 'Produto', defaultUnit: 'FD' }, quantity: 20,
      batch: { code: 'OCCINV', manufacturingDate: '2026-09-10', expirationDate: '2029-09-10' }, photoMimeType: null },
  ],
} as unknown as Shipment;

describe('Separação imediata para retorno', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    vi.spyOn(api, 'get').mockImplementation((path) => {
      if (path === '/settings/shipment-photos') return Promise.resolve({ minimum: 1, maximum: 5 });
      if (path.startsWith('/shipments?')) return Promise.resolve({ items: [], meta: { total: 0, page: 1, limit: 10, totalPages: 0 } });
      return Promise.resolve(shipment);
    });
  });
  afterEach(() => { act(() => { root.unmount(); }); host.remove(); vi.restoreAllMocks(); });

  it('mostra lote e fabricação em cada card sem alterar as quantidades do rascunho', async () => {
    await act(async () => { root.render(<ShipmentsPage user={user} initialId={shipment.id} />); await Promise.resolve(); });
    const continueButton = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent === 'Continuar separação')!;
    expect(continueButton).toBeDefined();
    await act(async () => { continueButton.click(); await Promise.resolve(); });

    const cards = host.querySelectorAll('[aria-labelledby="separation-title"] .shipment-item-card');
    expect(cards).toHaveLength(2);
    expect(cards[0].querySelector('p')?.textContent).toBe('Lote CICINV · 09/09/2026');
    expect(cards[1].querySelector('p')?.textContent).toBe('Lote OCCINV · 10/09/2026');
    expect(cards[0].querySelector('input[type="number"]')?.getAttribute('value')).toBe('12');
    expect(cards[1].querySelector('input[type="number"]')?.getAttribute('value')).toBe('0');

    const save = vi.spyOn(api, 'patch').mockResolvedValue({});
    const saveButton = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent === 'Salvar e sair')!;
    await act(async () => { saveButton.click(); await Promise.resolve(); });
    expect(save).toHaveBeenCalledWith('/shipments/shipment-1/separation-draft', {
      items: [{ shipmentItemId: 'item-a', returnQuantity: 12 }, { shipmentItemId: 'item-b', returnQuantity: 0 }],
    });
  });
});
