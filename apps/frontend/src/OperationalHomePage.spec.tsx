// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, Movement, UserSession } from './api';
import { OperationalHomePage } from './OperationalHomePage';

const shipment = {
  id: 'shipment-1', codigoMovimentacao: 'ENT-000152', originSector: 'EXPEDICAO', destinationSector: 'REVISAO', status: 'AGUARDANDO_RECEBIMENTO',
  createdBy: { id: 'operator', username: 'Expedição' }, createdAt: '2026-09-01T12:00:00Z', items: [],
};
const movement = {
  id: 'movement-1', codigoMovimentacao: 'ENT-000153', type: 'ENTRADA_EXTERNA', status: 'EFETIVADA',
  pcpExecutionStatus: 'PENDENTE', requiresPcpExecution: true, occurredAt: '2026-09-01T12:00:00Z',
  originLocation: { name: 'Expedição' }, destinationLocation: { name: 'Revisar' }, responsibleUser: { username: 'Operador' }, items: [],
} as unknown as Movement;
const user: UserSession = { id: 'u', username: 'Operador', sector: 'REVISAO', roles: ['REVISAO'], permissions: ['shipments.read', 'shipments.decide', 'movements.read'] };
let host: HTMLDivElement; let root: Root;
const navigate = vi.fn(); const onOpenRecord = vi.fn();
const result = (items: unknown[]) => ({ items, meta: { total: items.length, page: 1, limit: 10, totalPages: 1 } });
async function click(text: string) {
  const button = Array.from(host.querySelectorAll('button')).find((element) => element.textContent?.includes(text));
  expect(button).toBeTruthy();
  await act(async () => { await Promise.resolve(); button!.click(); });
}

describe('Resumo operacional da Home', () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    vi.spyOn(api, 'get').mockImplementation(async (path) => { await Promise.resolve();
      if (path === '/shipments/shipment-1') return shipment;
      if (path.startsWith('/shipments')) return result([shipment]);
      if (path === '/pcp/movements/movement-1') return { ...movement, shipmentEvidence: [] };
      if (path.startsWith('/pcp/movements?')) { const { items: _items, ...summary } = movement; return result([{ ...summary, itemCount: _items.length }]); }
      return result([movement]);
    });
  });
  afterEach(async () => { await Promise.resolve(); await act(async () => { root.unmount(); await Promise.resolve(); }); host.remove(); vi.restoreAllMocks(); vi.clearAllMocks(); });
  it('exibe código e abre resumo ao clicar, navegando somente pela ação', async () => { await Promise.resolve();
    await act(async () => { root.render(<OperationalHomePage user={user} navigate={navigate} onOpenRecord={onOpenRecord} />); await Promise.resolve(); });
    expect(host.textContent).toContain('ENT-000153');
    await click('Entrada externa');
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('ENT-000153');
    expect(navigate).not.toHaveBeenCalled();
    await click('Ver detalhes completos');
    expect(onOpenRecord).toHaveBeenCalledWith('movements', 'movement-1');
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });
  it('abre envio com aceite autorizado e fecha com ESC', async () => { await Promise.resolve();
    await act(async () => { root.render(<OperationalHomePage user={user} navigate={navigate} onOpenRecord={onOpenRecord} />); await Promise.resolve(); });
    await click('Expedição → Revisão');
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('ENT-000152');
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('Confirmar recebimento');
    await act(async () => { await Promise.resolve(); host.querySelector('[role="dialog"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });
  it('omite aceite sem permissão e leva ao envio correto', async () => { await Promise.resolve();
    await act(async () => { root.render(<OperationalHomePage user={{ ...user, permissions: ['shipments.read'] }} navigate={navigate} onOpenRecord={onOpenRecord} />); await Promise.resolve(); });
    await click('Expedição → Revisão');
    expect(host.querySelector('[role="dialog"]')?.textContent).not.toContain('Confirmar recebimento');
    await click('Ver detalhes completos');
    expect(onOpenRecord).toHaveBeenCalledWith('shipments', 'shipment-1');
  });
  it('consulta resumo PCP e encaminha execução para a tela existente', async () => { await Promise.resolve();
    await act(async () => { root.render(<OperationalHomePage user={{ ...user, sector: 'PCP', permissions: ['pcp.movements.read', 'pcp.movements.execute'] }} navigate={navigate} onOpenRecord={onOpenRecord} />); await Promise.resolve(); });
    await click('Entrada externa');
    await click('Marcar como executada');
    expect(onOpenRecord).toHaveBeenCalledWith('pcp-all', 'movement-1');
  });
  it('carrega fotos privadas no resumo e permite ampliar', async () => {
    const getPhoto = vi.spyOn(api, 'getBlob').mockResolvedValue(new Blob(['photo'], { type: 'image/jpeg' }));
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:test-photo') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const originalGet = api.get.bind(api);
    vi.spyOn(api, 'get').mockImplementation(async (path) => {
      if (path === '/shipments/shipment-1') return { ...shipment, items: [{ id: 'item-1', quantity: 10, productSnapshot: { code: 'P1', name: 'Produto teste', defaultUnit: 'UN' }, batch: { code: 'COCINV', manufacturingDate: '2026-09-01', expirationDate: '2027-09-01' }, photoMimeType: 'image/jpeg' }] };
      return await originalGet(path);
    });
    await act(async () => { root.render(<OperationalHomePage user={user} navigate={navigate} onOpenRecord={onOpenRecord} />); await Promise.resolve(); });
    await click('Expedição → Revisão');
    expect(getPhoto).toHaveBeenCalledWith('/shipments/shipment-1/items/item-1/photo');
    expect(host.querySelector('img')?.getAttribute('src')).toBe('blob:test-photo');
    expect(host.textContent).toContain('Produto teste');
    await act(async () => { host.querySelector('img')!.closest('button')!.click(); await Promise.resolve(); });
    expect(host.querySelector('.photo-viewer-dialog')).not.toBeNull();
    await act(async () => { host.querySelector<HTMLButtonElement>('[aria-label="Aumentar zoom"]')!.click(); await Promise.resolve(); });
    expect(host.querySelector('output')?.textContent).toBe('150%');
  });
});
