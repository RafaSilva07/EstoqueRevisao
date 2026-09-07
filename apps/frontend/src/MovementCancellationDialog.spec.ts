import { describe, expect, it } from 'vitest';
import { Movement } from './api';
import { movementCancellationImpact } from './movement-cancellation-impact';

const base = {
  originLocation: { name: 'Revisar' },
  destinationLocation: { name: 'TUF' },
  items: [{
    product: { code: 'X', name: 'Produto X', defaultUnit: 'UN' },
    batch: { code: 'LOTE-A' },
    destinationBatch: { code: 'LOTE-B' },
    quantity: 10,
    distributions: [],
  }],
} as unknown as Movement;

describe('impacto do cancelamento', () => {
  it('explicita lotes e locais ao estornar transferencia', () => {
    const impact = movementCancellationImpact({
      ...base,
      type: 'TRANSFERENCIA_INTERNA',
    });
    expect(impact[0]).toContain('lote LOTE-B / TUF');
    expect(impact[0]).toContain('lote LOTE-A / Revisar');
  });

  it('detalha cada destino e a devolucao total da revisao', () => {
    const impact = movementCancellationImpact({
      ...base,
      type: 'REVISAO',
      items: [{
        ...base.items[0],
        distributions: [
          { destinationLocation: { name: 'Lata Boa' }, quantity: 6 },
          { destinationLocation: { name: 'Varejo' }, quantity: 4 },
        ],
      }],
    } as Movement);
    expect(impact).toHaveLength(3);
    expect(impact[2]).toContain('total de 10 UN para Revisar');
  });
});
