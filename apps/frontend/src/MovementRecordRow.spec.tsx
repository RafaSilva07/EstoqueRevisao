import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MovementRecordRow, MovementRecordRowProps } from './MovementRecordRow';
import { formatRecordDateTime } from './format';

const record: MovementRecordRowProps = {
  code: 'ENT-000009-A', occurredAt: '2026-09-28T14:30:00', status: 'Aguardando PCP', statusTone: 'pending',
  productCode: '005601.90', productName: 'Produto teste', batchCode: 'ABC123', manufacturingDate: '2026-09-09',
  unit: 'FD', quantity: 13, origin: 'Expedição', destination: 'Revisão', sentBy: 'Ana', receivedBy: 'Bia',
  pcpExecutedBy: null, receiptRequired: true, pcpRequired: true, onOpen: () => undefined,
};

describe('Linha de movimentação', () => {
  it('mostra identidade, data, produto, rota e responsáveis com execução pendente', () => {
    const html = renderToStaticMarkup(<MovementRecordRow {...record} />);
    expect(html).toContain('ENT-000009-A');
    expect(html).toContain('seg, 28/09/2026 14:30');
    expect(html).toContain('005601.90 · Produto teste');
    expect(html).toContain('ABC123 · 09/09/2026');
    expect(html).toContain('13 FD');
    expect(html).toContain('Expedição → Revisão');
    expect(html).toContain('Ana');
    expect(html).toContain('Bia');
    expect(html).toContain('Pendente');
  });

  it('distingue etapa pendente de etapa não aplicável', () => {
    const html = renderToStaticMarkup(<MovementRecordRow {...record} receivedBy={null}
      receiptRequired={false} pcpRequired={false} />);
    expect(html).toContain('Não se aplica');
    expect(html).toContain('Não necessário');
    expect(formatRecordDateTime('2026-09-28T14:30:00')).toBe('seg, 28/09/2026 14:30');
  });
});
