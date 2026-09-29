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

  it('mostra os destinos e as quantidades da revisão em duas linhas, na ordem operacional', () => {
    const reviewDistributions = [
      { destinationCode: 'TUF', destination: 'TUF', quantity: 10 },
      { destinationCode: 'VAREJO', destination: 'Varejo', quantity: 20 },
      { destinationCode: 'LATA_BOA', destination: 'Lata Boa', quantity: 30 },
    ];
    const html = renderToStaticMarkup(<MovementRecordRow {...record} reviewDistributions={reviewDistributions} reviewDistributionUnit="UN" />);
    expect(html).toContain('Distribuição da revisão · UN');
    expect(html.indexOf('Lata Boa')).toBeLessThan(html.indexOf('Varejo'));
    expect(html.indexOf('Varejo')).toBeLessThan(html.indexOf('TUF'));
    expect(html).toContain('aria-label="Lata Boa: 30 UN"');
    expect(html).toContain('aria-label="Varejo: 20 UN"');
    expect(html).toContain('aria-label="TUF: 10 UN"');
    const single = renderToStaticMarkup(<MovementRecordRow {...record} reviewDistributions={reviewDistributions.slice(0, 1)} />);
    expect(single).not.toContain('review-distribution-matrix');
  });
});
