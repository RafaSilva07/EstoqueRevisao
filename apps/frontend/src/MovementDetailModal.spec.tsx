// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Movement, PcpMovementDetail } from './api';
import { MovementDetailModal } from './MovementDetailModal';

vi.mock('./ShipmentsPage', () => ({ ShipmentPhoto: ({ productName }: { productName: string }) => <span>Foto de {productName}</span> }));

const movement = {
  id: 'movement-1', type: 'REVISAO', codigoMovimentacao: 'REV-000001',
  originLocation: { name: 'Revisar' }, destinationLocation: null,
  responsibleUser: { username: 'Operador' }, occurredAt: '2026-09-24T20:37:00Z',
  status: 'EFETIVADA', requiresPcpExecution: false, pcpExecutionStatus: 'PENDENTE',
  observation: 'Conferido no recebimento.', items: [{
    id: 'item-1', product: { code: 'P-1', name: 'Produto X', defaultUnit: 'UN' },
    batch: { code: 'LOTE-A', manufacturingDate: '2026-01-01', expirationDate: '2029-01-01' },
    quantity: 10, distributions: [
      { id: 'distribution-1', quantity: 6, destinationLocation: { name: 'Lata Boa' } },
      { id: 'distribution-2', quantity: 4, destinationLocation: { name: 'TUF' } },
    ],
  }],
} as unknown as Movement;

describe('detalhe da movimentação', () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  });
  afterEach(() => { act(() => root.unmount()); host.remove(); });

  it('prioriza a rota com todos os destinos reais e deixa a observação por último', () => {
    act(() => root.render(<MovementDetailModal movementId={movement.id} initialMovement={movement} onClose={() => undefined} />));
    const route = host.querySelector('.movement-route')!;
    const products = host.querySelector('#movement-products-title')!;
    const facts = host.querySelector('#movement-info-title')!;
    const notes = host.querySelector('#movement-notes-title')!;
    expect(route.textContent).toContain('Revisar');
    expect(route.textContent).toContain('Lata Boa · TUF');
    expect(route.compareDocumentPosition(products) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(products.compareDocumentPosition(facts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(facts.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(host.textContent).toContain('Conferido no recebimento.');
  });

  it('abre a foto somente dentro do produto escolhido enquanto aguarda PCP', () => {
    const pending = {
      ...movement, requiresPcpExecution: true, pcpExecutionStatus: 'PENDENTE',
      items: [
        { ...movement.items[0], id: 'item-1', productId: 'product-1', batchId: 'batch-1', product: { code: 'P-1', name: 'Produto X', defaultUnit: 'UN' } },
        { ...movement.items[0], id: 'item-2', productId: 'product-2', batchId: 'batch-2', product: { code: 'P-2', name: 'Produto Y', defaultUnit: 'UN' } },
      ],
      shipmentEvidence: [
        { itemId: 'photo-1', shipmentId: 'shipment-1', productId: 'product-1', batchId: 'batch-1', photoMimeType: 'image/jpeg' },
        { itemId: 'photo-2', shipmentId: 'shipment-1', productId: 'product-2', batchId: 'batch-2', photoMimeType: 'image/jpeg' },
      ],
    } as PcpMovementDetail;
    act(() => root.render(<MovementDetailModal movementId={pending.id} initialMovement={pending} pcp onClose={() => undefined} />));
    const cards = host.querySelectorAll('.movement-detail-items > li');
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).not.toContain('Foto de Produto X');
    expect(cards[1].textContent).not.toContain('Foto de Produto Y');
    act(() => cards[0].querySelector('button')?.click());
    expect(cards[0].textContent).toContain('Foto de Produto X');
    expect(cards[1].textContent).not.toContain('Foto de Produto Y');
    act(() => cards[1].querySelector('button')?.click());
    expect(cards[1].textContent).toContain('Foto de Produto Y');
    act(() => cards[0].querySelector('button')?.click());
    expect(cards[0].textContent).not.toContain('Foto de Produto X');
    expect(cards[1].textContent).toContain('Foto de Produto Y');
  });
});
