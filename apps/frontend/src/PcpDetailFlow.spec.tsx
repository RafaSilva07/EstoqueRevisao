// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, MockInstance, vi } from 'vitest';
import { api, PcpMovementDetail } from './api';
import { PcpPage } from './PcpPage';
import { formatDateTime } from './format';

vi.mock('./ShipmentItems', () => ({ ShipmentPhoto: ({ productName }: { productName: string }) => <span>Foto de {productName}</span> }));

const group = {
  id: 'movement-1', type: 'ENTRADA_EXTERNA', codigoMovimentacao: 'ENT-000012',
  originLocation: { name: 'Expedição' }, destinationLocation: { name: 'Revisar' },
  responsibleUser: { username: 'Recebedor' }, occurredAt: '2026-09-30T21:21:00Z',
  status: 'EFETIVADA', operationalStatus: 'CONCLUIDA', requiresPcpExecution: true, pcpExecutionStatus: 'PENDENTE',
  observation: 'Envio confirmado pelo destinatário.', shipmentId: 'shipment-1',
  shipment: {
    id: 'shipment-1', createdBy: { username: 'Remetente' }, createdAt: '2026-09-30T21:19:00Z',
    decidedBy: { username: 'Recebedor' }, decidedAt: '2026-09-30T21:21:00Z',
  },
  items: [
    { id: 'item-a', codigoRegistro: 'ENT-000012-A', shipmentItemId: 'photo-a', quantity: 7, pcpExecutionStatus: 'PENDENTE',
      productSnapshot: { code: '005601.96', name: 'Produto A', defaultUnit: 'FD' },
      batch: { code: 'NVCVNE', manufacturingDate: '2024-06-26', expirationDate: '2027-06-26' }, distributions: [] },
    { id: 'item-b', codigoRegistro: 'ENT-000012-B', shipmentItemId: 'photo-b', quantity: 10, pcpExecutionStatus: 'EXECUTADA',
      productSnapshot: { code: '005401.96', name: 'Produto B', defaultUnit: 'CX' },
      batch: { code: 'CICINV', manufacturingDate: '2026-09-09', expirationDate: '2029-09-09' }, distributions: [] },
  ],
  shipmentEvidence: [{ itemId: 'photo-a', shipmentId: 'shipment-1', photoMimeType: 'image/jpeg' }],
  auditHistory: [{ id: 'event-1', action: 'SHIPMENT_MOVEMENT_CREATE', user: { username: 'Recebedor' }, createdAt: '2026-09-30T21:21:00Z' }],
} as unknown as PcpMovementDetail;
const record = { ...group, recordId: 'item-a', codigoRegistro: 'ENT-000012-A', codigoGrupo: 'ENT-000012', groupItemCount: 2, items: [group.items[0]] };

describe('detalhe aberto pela fila PCP', () => {
  let host: HTMLDivElement;
  let root: Root;
  let getSpy: MockInstance<typeof api.get>;
  beforeEach(() => {
    vi.useFakeTimers();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    getSpy = vi.spyOn(api, 'get').mockImplementation(<T,>(path: string): Promise<T> => {
      if (path === '/stocks?limit=100') return Promise.resolve({ items: [] } as T);
      if (path.startsWith('/pcp/movements?')) return Promise.resolve({ items: [{ ...record, productSnapshot: record.items[0].productSnapshot, batch: record.items[0].batch, quantity: 7, itemCount: 2 }], meta: { total: 1, totalPages: 1 } } as T);
      if (path === '/pcp/movements/records/item-a') return Promise.resolve(record as T);
      if (path === '/pcp/movements/movement-1') return Promise.resolve(group as T);
      throw new Error(`Consulta inesperada: ${path}`);
    });
  });
  afterEach(() => {
    act(() => root.unmount()); host.remove();
    vi.useRealTimers(); vi.restoreAllMocks();
  });

  const button = (text: string) => Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((node) => node.textContent?.includes(text))!;
  async function interact(action: () => void) {
    await act(() => { action(); return Promise.resolve(); });
  }
  async function openRecord() {
    await interact(() => root.render(<PcpPage />));
    await act(async () => vi.advanceTimersByTimeAsync(200));
    await interact(() => host.querySelector<HTMLButtonElement>('.movement-record-line-main')!.click());
  }

  it('usa o detalhe atual ao clicar na fila, preservando grupo, evidência e auditoria', async () => {
    await openRecord();
    const dialog = host.querySelector('[role="dialog"]')!;
    expect(dialog.classList.contains('movement-detail-dialog')).toBe(true);
    expect(dialog.querySelector('dl')).toBeNull();
    expect(dialog.querySelector('.movement-detail-heading-meta')?.textContent).toContain('ENT-000012-A');
    expect(dialog.querySelector('.movement-detail-heading-meta')?.textContent).toContain('PCP: Pendente');
    expect(dialog.querySelector('.movement-detail-group')?.textContent).toContain('2 registros');
    expect(dialog.querySelector('.movement-route')?.textContent).toContain('Expedição');
    expect(dialog.querySelector('.movement-route')?.textContent).toContain('Revisar');
    expect(dialog.querySelector('.movement-product-heading')?.textContent).toContain('7 FD');
    expect(dialog.textContent).not.toContain('Produto B');
    expect(dialog.querySelector('.movement-facts')?.textContent).toContain('Remetente');
    expect(dialog.querySelector('.movement-facts')?.textContent).toContain(formatDateTime(group.shipment!.createdAt));
    expect(dialog.querySelector('.movement-facts')?.textContent).toContain(formatDateTime(group.shipment!.decidedAt!));
    expect(dialog.querySelector('#pcp-audit-title')?.parentElement?.textContent).toContain('Movimentação de estoque registrada');
    expect(dialog.textContent).not.toContain('Foto de Produto A');
    await interact(() => button('Mostrar fotos').click());
    expect(dialog.querySelector('.movement-product-list > li')?.textContent).toContain('Foto de Produto A');
    await interact(() => button('Ocultar fotos').click());
    expect(dialog.textContent).not.toContain('Foto de Produto A');
    await interact(() => Array.from(dialog.querySelectorAll<HTMLButtonElement>('button')).find((node) => node.textContent === 'Fechar')!.click());
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(getSpy).toHaveBeenCalledWith('/pcp/movements/records/item-a');
  });

  it('navega entre grupo e registro e executa somente o filho escolhido', async () => {
    await openRecord();
    await interact(() => button('Ver grupo').click());
    const cards = host.querySelectorAll('.movement-product-list > li');
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toContain('PCP: Pendente');
    expect(cards[1].textContent).toContain('PCP: Executada');
    expect(host.textContent).not.toContain('Marcar registro como executado');
    await interact(() => button('ENT-000012-A · Ver registro').click());

    const executed = { ...record, pcpExecutionStatus: 'EXECUTADA', pcpExecutedByUser: { id: 'pcp-1', username: 'Operador PCP' },
      pcpExecutedAt: '2026-10-01T12:00:00Z', pcpExecutionObservation: 'Lançamento conferido.',
      items: [{ ...record.items[0], pcpExecutionStatus: 'EXECUTADA', pcpExecutedByUser: { id: 'pcp-1', username: 'Operador PCP' }, pcpExecutedAt: '2026-10-01T12:00:00Z' }],
      auditHistory: [...record.auditHistory, { id: 'event-2', action: 'PCP_MOVEMENT_RECORD_EXECUTE', user: { username: 'Operador PCP' }, createdAt: '2026-10-01T12:00:00Z' }],
    };
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue(executed);
    await interact(() => button('Marcar registro como executado').click());
    const form = host.querySelector<HTMLFormElement>('form')!;
    form.querySelector<HTMLTextAreaElement>('textarea')!.value = ' Lançamento conferido. ';
    // FormData do navegador acompanha os controles reais do formulário.
    vi.stubGlobal('FormData', window.FormData);
    try {
      await interact(() => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    } finally { vi.unstubAllGlobals(); }
    expect(postSpy).toHaveBeenCalledExactlyOnceWith('/pcp/movements/records/item-a/execution', { observation: 'Lançamento conferido.' });
    expect(host.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(host.querySelector('.movement-detail-heading-meta')?.textContent).toContain('PCP: Executada');
    expect(host.querySelector('.movement-detail-event')?.textContent).toContain('Operador PCP');
    expect(host.querySelector('.movement-notes')?.textContent).toContain('Lançamento conferido.');
    expect(host.querySelector('#pcp-audit-title')?.parentElement?.textContent).toContain('Registro executado pelo PCP');
    expect(host.textContent).not.toContain('Marcar registro como executado');
  });
});
