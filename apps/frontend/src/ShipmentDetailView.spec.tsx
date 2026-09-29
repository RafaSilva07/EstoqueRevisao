import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ShipmentDetailView } from './ShipmentDetailView';
import { Shipment } from './shipments';

const shipment = {
  id: 'shipment-1', codigoMovimentacao: 'ENT-000003', originSector: 'PRODUCAO', destinationSector: 'REVISAO',
  status: 'CONFIRMADO', shipmentKind: 'NORMAL', createdBy: { id: 'sender', username: 'Envio' },
  createdAt: '2026-09-16T00:24:00Z', decidedBy: { username: 'Recebimento' }, decidedAt: '2026-09-16T00:25:00Z',
  observation: 'Conferido.', movements: [{ id: 'movement-1', codigoMovimentacao: 'ENT-000003', requiresPcpExecution: true,
    pcpExecutionStatus: 'PENDENTE', occurredAt: '2026-09-16T00:25:00Z', items: [{ id: 'movement-item-a', shipmentItemId: 'item-a' }] }],
  items: [
    { id: 'item-a', codigoRegistro: 'ENT-000003-A', productSnapshot: { code: '005601.96', name: 'Produto A', defaultUnit: 'FD' }, quantity: 30,
      batch: { code: 'CICINV', manufacturingDate: '2026-09-09', expirationDate: '2029-09-09' }, photoMimeType: null },
    { id: 'item-b', codigoRegistro: 'ENT-000003-B', productSnapshot: { code: '005602.96', name: 'Produto B', defaultUnit: 'FD' }, quantity: 10,
      batch: { code: 'COCINV', manufacturingDate: '2026-09-10', expirationDate: '2029-09-10' }, photoMimeType: null },
  ],
} as unknown as Shipment;

describe('detalhe compartilhado do envio', () => {
  it('usa a hierarquia visual do detalhe de movimentação e preserva status, rota e responsáveis', () => {
    const html = renderToStaticMarkup(<ShipmentDetailView shipment={shipment} titleId="shipment-title" onClose={() => undefined} />);
    expect(html).toContain('Detalhes do envio');
    expect(html).toContain('ENT-000003');
    expect(html).toContain('PCP: Pendente');
    expect(html).toContain('class="movement-route"');
    expect(html).toContain('Origem');
    expect(html).toContain('Destino');
    expect(html).toContain('Produtos e quantidades');
    expect(html).toContain('Responsáveis e data');
    expect(html).toContain('Recebimento');
    expect(html).toContain('Conferido.');
    expect(html.indexOf('Produtos e quantidades')).toBeLessThan(html.indexOf('Responsáveis e data'));
  });

  it('mostra somente o registro escolhido e mantém acesso ao grupo', () => {
    const html = renderToStaticMarkup(<ShipmentDetailView shipment={shipment} titleId="shipment-title" recordId="item-a"
      onClose={() => undefined} onViewGroup={() => undefined} />);
    expect(html).toContain('ENT-000003-A');
    expect(html).toContain('Produto A');
    expect(html).not.toContain('Produto B');
    expect(html).toContain('Ver grupo');
  });

  it('identifica recusa e preserva o motivo na área de observações', () => {
    const html = renderToStaticMarkup(<ShipmentDetailView shipment={{ ...shipment, status: 'RECUSADO', refusalReason: 'Produto avariado' }}
      titleId="shipment-title" onClose={() => undefined} />);
    expect(html).toContain('Recusado');
    expect(html).toContain('Motivo da recusa:');
    expect(html).toContain('Produto avariado');
    expect(html).not.toContain('PCP: Pendente');
  });
});
