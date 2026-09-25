// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShipmentStockOutcome } from './ShipmentStockOutcome';
import { Shipment } from './shipments';

const base = {
  separationCompletedAt: '2026-09-24T23:37:16Z', originSector: 'EXPEDICAO', destinationSector: 'REVISAO',
  movements: [{ id: 'movement-1', codigoMovimentacao: 'ENT-000009', occurredAt: '2026-09-24T23:37:16Z',
    requiresPcpExecution: true, pcpExecutionStatus: 'PENDENTE', items: [{ id: 'item-1', quantity: 89,
      productSnapshot: { code: 'P-1', name: 'Produto X', defaultUnit: 'UN' }, batch: { code: 'LOTE-A' } }] }],
} as unknown as Shipment;

describe('resultado histórico da separação imediata', () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  });
  afterEach(() => { act(() => root.unmount()); host.remove(); });

  it('mostra a entrada líquida registrada e abre a movimentação vinculada', () => {
    const open = vi.fn();
    act(() => root.render(<ShipmentStockOutcome shipment={base} onOpenMovement={open} />));
    expect(host.textContent).toContain('89 UN adicionados ao estoque');
    expect(host.textContent).toContain('ENT-000009');
    act(() => host.querySelector('button')?.click());
    expect(open).toHaveBeenCalledWith('movement-1');
  });

  it('distingue retorno integral de entrada parcial', () => {
    act(() => root.render(<ShipmentStockOutcome shipment={{ ...base, movements: [] }} />));
    expect(host.textContent).toContain('Retorno integral');
  });
});
