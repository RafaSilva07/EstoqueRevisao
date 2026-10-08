// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { AdministrativeShipmentActions } from './AdministrativeShipmentActions';
import { OperationalActionsContext } from './operational-actions';
import { Shipment } from './shipments';

const shipment = { id: 'shipment', codigoMovimentacao: 'ENT-000001', originSector: 'PRODUCAO', destinationSector: 'REVISAO', status: 'CONFIRMADO', shipmentKind: 'NORMAL',
  createdBy: { id: 'sender', username: 'Autor' }, createdAt: '2026-10-07T10:00:00Z', movements: [{ pcpExecutionStatus: 'PENDENTE', items: [{ pcpExecutionStatus: 'PENDENTE' }] }],
  items: [{ id: 'item', quantity: 10, productSnapshot: { code: '005601.90', name: 'Produto X', defaultUnit: 'UN' }, batch: { code: 'CICINV', manufacturingDate: '2026-09-09' } }],
} as unknown as Shipment;
describe('administração auditável dos envios', () => {
  let host: HTMLDivElement; let root: Root;
  const done = vi.fn(); const changed = vi.fn();
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
    done.mockReset(); changed.mockReset(); vi.spyOn(api, 'get').mockResolvedValue(shipment);
  });
  afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); });
  function render(roles: string[], data = shipment) { act(() => root.render(<OperationalActionsContext.Provider value={{ adminRoles: roles, changed }}><AdministrativeShipmentActions shipmentId={data.id} shipment={data} onDone={done} /></OperationalActionsContext.Provider>)); }
  async function click(text: string) { const button = [...host.querySelectorAll('button')].find((button) => button.textContent === text)!; expect(button).toBeTruthy(); await act(async () => { button.click(); await Promise.resolve(); }); }
  async function reason() {
    const input = [...host.querySelectorAll('textarea')].find((input) => input.closest('label')?.textContent?.includes('Motivo obrigatório'))!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, 'Correção conferida'); input.dispatchEvent(new Event('input', { bubbles: true })); await Promise.resolve(); });
  }
  it('não oferece alterações ao operador e protege PCP parcial para administradores', () => {
    render(['PCP']); expect(host.textContent).not.toContain('Editar solicitação');
    render(['ADMIN'], { ...shipment, movements: [{ ...shipment.movements![0], items: [{ ...shipment.movements![0].items![0], pcpExecutionStatus: 'EXECUTADA' }] }] });
    expect(host.textContent).toContain('Alterações bloqueadas'); expect(host.textContent).not.toContain('Cancelar solicitação');
  });
  it('exige motivo e conferência antes de cancelar e impede duplo envio', async () => {
    let finish!: () => void;
    const post = vi.spyOn(api, 'post').mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    render(['ADMIN']); await click('Cancelar solicitação');
    expect([...host.querySelectorAll('button')].find((button) => button.textContent === 'Conferir impacto')?.disabled).toBe(true);
    await reason(); await click('Conferir impacto'); expect(host.textContent).toContain('solicitação inteira'); expect(post).not.toHaveBeenCalled();
    await click('Confirmar cancelamento');
    expect(post).toHaveBeenCalledExactlyOnceWith('/shipments/shipment/admin-cancellation', { reason: 'Correção conferida' });
    expect([...host.querySelectorAll('button')].find((button) => button.textContent === 'Confirmando…')?.disabled).toBe(true);
    await act(async () => { finish(); await Promise.resolve(); }); expect(done).toHaveBeenCalledOnce(); expect(changed).toHaveBeenCalledOnce();
  });
  it('edita quantidades em solicitação vinculada mantendo produto e lote', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ id: 'correction' });
    render(['ADMIN_PRODUCAO_PCP']); await click('Editar solicitação');
    const input = host.querySelector<HTMLInputElement>('input[type=number]')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '8'); input.dispatchEvent(new Event('input', { bubbles: true })); await Promise.resolve(); });
    await reason(); await click('Conferir impacto'); await click('Confirmar correção');
    expect(post).toHaveBeenCalledWith('/shipments/shipment/correction', expect.objectContaining({ reason: 'Correção conferida', items: [{ shipmentItemId: 'item', quantity: 8, observation: undefined }] }));
    expect(done).toHaveBeenCalledOnce(); expect(changed).toHaveBeenCalledOnce();
  });
  it('erro do estorno fica visível sem fechar nem limpar o preenchimento', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(new Error('Saldo insuficiente'));
    render(['ADMIN']); await click('Cancelar solicitação'); await reason(); await click('Conferir impacto'); await click('Confirmar cancelamento');
    expect(host.textContent).toContain('Saldo insuficiente'); expect(host.textContent).toContain('Correção conferida'); expect(done).not.toHaveBeenCalled();
  });
});
