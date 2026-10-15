// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, UserSession } from './api';
import { ShipmentsPage } from './ShipmentsPage';
import { Shipment } from './shipments';

vi.mock('./ShipmentItems', () => ({ ShipmentItems: () => <p>Itens recebidos</p> }));

const user: UserSession = { id: 'review', username: 'Revisão', sector: 'REVISAO', roles: ['REVISAO'], permissions: ['shipments.read', 'shipments.decide'] };
const incoming = {
  id: 'receipt', codigoMovimentacao: 'ENT-000123', originSector: 'EXPEDICAO', destinationSector: 'REVISAO',
  status: 'AGUARDANDO_RECEBIMENTO', shipmentKind: 'NORMAL', observation: null, createdAt: '2026-10-15T12:00:00Z',
  createdBy: { id: 'sender', username: 'Expedição' }, items: [{ id: 'item', codigoRegistro: 'ENT-000123-A',
    productId: 'product', batchId: 'batch', productSnapshot: { code: '003375.00', name: 'SEL LEG PETITOSA', defaultUnit: 'UN' }, quantity: 10,
    batch: { code: 'LOTE-A', manufacturingDate: '2026-10-01', expirationDate: '2029-10-01' }, photoMimeType: null }],
} as unknown as Shipment;
const result = (items: Shipment[]) => ({ items, meta: { page: 1, totalPages: 1, total: items.length, limit: 10 } });
let host: HTMLDivElement; let root: Root; let current: Shipment;
async function click(text: string, scope: ParentNode = host) {
  const button = Array.from(scope.querySelectorAll<HTMLButtonElement>('button')).find((element) => element.textContent === text);
  expect(button, text).toBeTruthy();
  await act(async () => { button!.click(); await Promise.resolve(); });
}
async function render(props: Partial<Parameters<typeof ShipmentsPage>[0]> = {}) {
  await act(async () => { root.render(<ShipmentsPage user={user} {...props} />); await new Promise((resolve) => setTimeout(resolve, 15)); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 15)); });
}
async function confirm(separate: boolean) {
  await click('Ver itens e detalhes'); await click('Confirmar recebimento');
  if (separate) await act(async () => { host.querySelector<HTMLInputElement>('input[type=radio]:not(:checked)')!.click(); await Promise.resolve(); });
  await act(async () => { host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await Promise.resolve(); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 15)); });
}

describe('Recebimento e retomada da separação', () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    current = structuredClone(incoming);
    vi.spyOn(api, 'get').mockImplementation(async (path) => {
      await Promise.resolve();
      if (path === '/settings/shipment-photos') return { minimum: 1, maximum: 5 };
      if (path === '/shipments/receipt') return structuredClone(current);
      const params = new URLSearchParams(path.split('?')[1]);
      return result(params.get('status') === current.status ? [structuredClone(current)] : []);
    });
    vi.spyOn(api, 'post').mockImplementation(async (_path, payload) => {
      await Promise.resolve();
      current = { ...current, status: (payload as { immediateSeparation?: boolean }).immediateSeparation ? 'EM_SEPARACAO' : 'CONFIRMADO',
        decidedBy: { username: 'Revisão' }, decidedAt: '2026-10-15T12:10:00Z', separationExpiresAt: '2026-10-15T16:10:00Z' };
      return structuredClone(current);
    });
  });
  afterEach(async () => { await act(async () => { root.unmount(); await Promise.resolve(); }); host.remove(); vi.restoreAllMocks(); });

  it('abre a separação após receber, permite salvar/sair e retomar pelas separações em andamento', async () => {
    const patch = vi.spyOn(api, 'patch').mockImplementation(async () => {
      await Promise.resolve(); current.items[0].separationDraft = { returnQuantity: 2 }; return structuredClone(current);
    });
    await render(); await confirm(true);
    expect(host.querySelector('#separation-title')?.textContent).toBe('Finalizar separação');
    expect(host.querySelector('[role=dialog]')?.textContent).toContain('Recebimento ENT-000123');
    expect(host.querySelector('[role=dialog]')?.textContent).toContain('Lote LOTE-A · 01/10/2026');
    const quantity = host.querySelector<HTMLInputElement>('input[type=number]')!;
    act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(quantity, '2'); quantity.dispatchEvent(new Event('input', { bubbles: true })); });
    await click('Salvar e sair');
    expect(patch).toHaveBeenCalledWith('/shipments/receipt/separation-draft', { items: [{ shipmentItemId: 'item', returnQuantity: 2 }] });
    expect(host.querySelector('[role=dialog]')).toBeNull();
    expect(host.querySelector('[aria-pressed=true]')?.textContent).toBe('Separações em andamento');
    await click('Continuar separação');
    expect(host.querySelector('#separation-title')?.textContent).toBe('Finalizar separação');
    expect(host.querySelector<HTMLInputElement>('input[type=number]')?.value).toBe('2');
    await click('Continuar depois');
    expect(host.querySelector('[role=dialog]')).toBeNull();
  });
  it('mantém recebimento integral sem abrir separação', async () => {
    await render(); await confirm(false);
    expect(host.querySelector('[role=dialog]')).toBeNull();
    expect(host.textContent).toContain('Recebimento atualizado com sucesso.');
    expect(current.status).toBe('CONFIRMADO');
  });
  it('preserva a confirmação aberta e exibe falha sem iniciar a separação', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(new Error('Falha ao confirmar recebimento.'));
    await render(); await confirm(true);
    expect(host.querySelector('#shipment-decision-title')?.textContent).toBe('Confirmar recebimento');
    expect(host.querySelector('[role=alert]')?.textContent).toContain('Falha ao confirmar recebimento.');
    expect(host.querySelector('#separation-title')).toBeNull();
    expect(current.status).toBe('AGUARDANDO_RECEBIMENTO');
  });
  it('abre diretamente pelo atalho da Home e conclui usando a operação existente', async () => {
    current = { ...current, status: 'EM_SEPARACAO' };
    const complete = vi.spyOn(api, 'postMultipart').mockImplementation(async () => { await Promise.resolve(); current.status = 'CONFIRMADO'; return structuredClone(current); });
    await render({ initialId: 'receipt', initialView: 'separation' });
    expect(host.querySelector('#separation-title')?.textContent).toBe('Finalizar separação');
    await click('Concluir separação');
    expect(complete).toHaveBeenCalledWith('/shipments/receipt/separation-completion', { items: [{ shipmentItemId: 'item', returnQuantity: 0 }] }, []);
    expect(host.querySelector('[role=dialog]')).toBeNull();
    expect(host.textContent).toContain('Separação concluída e saldo líquido consolidado.');
  });
  it('não oferece a ação de separação para quem só consulta ou para outro setor', async () => {
    for (const operator of [{ ...user, permissions: ['shipments.read'] }, { ...user, sector: 'EXPEDICAO' as const }]) {
      await render({ user: operator });
      expect(host.querySelector('.shipment-tabs')?.textContent).not.toContain('Separações em andamento');
    }
  });
});
