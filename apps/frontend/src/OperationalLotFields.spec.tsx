import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OperationalLotFields } from './OperationalLotFields';
import { emptyLot } from './operational-lot';
import { movementCancellationImpact } from './movement-cancellation-impact';
import { Movement } from './api';

describe('lotes operacionais na interface', () => {
  it('orienta preenchimento relacionado e exige validade', () => {
    const html = renderToStaticMarkup(<OperationalLotFields
      product={{ id: 'p', code: 'X', name: 'Produto', defaultUnit: 'UN', active: true, shelfLifeYears: 3 }}
      value={emptyLot} onChange={() => undefined} onReady={() => undefined} />);
    expect(html).toContain('Preencha o lote ou a fabricação');
    expect(html).toContain('Lote CONSERVADI');
    expect(html).toContain('required=""');
    expect(html).not.toContain('Criar lote');
  });
  it('identifica as validades exatas no impacto do estorno', () => {
    const movement = {
      type: 'TRANSFERENCIA_INTERNA', originLocation: { name: 'Revisar' }, destinationLocation: { name: 'TUF' },
      items: [{
        product: { code: 'Novo', name: 'Nome atual', defaultUnit: 'CX' },
        productSnapshot: { code: 'X', name: 'Produto original', defaultUnit: 'UN' },
        batch: { code: 'SOCDNV', expirationDate: '2029-08-31' },
        destinationBatch: { code: 'SOCDNV', expirationDate: '2030-08-31' }, quantity: 10,
      }],
    } as unknown as Movement;
    const text = movementCancellationImpact(movement).join(' ');
    expect(text).toContain('31/08/2029');
    expect(text).toContain('31/08/2030');
    expect(text).toContain('10 UN');
    expect(text).toContain('Produto original');
    expect(text).not.toContain('Nome atual');
  });
});
