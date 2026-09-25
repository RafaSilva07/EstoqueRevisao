import { formatDateTime } from './format';
import { Shipment } from './shipments';

export function ShipmentStockOutcome({ shipment, onOpenMovement }: { shipment: Shipment; onOpenMovement?: (id: string) => void }) {
  if (!shipment.separationCompletedAt || shipment.originSector !== 'EXPEDICAO' || shipment.destinationSector !== 'REVISAO') return null;
  const movements = shipment.movements ?? [];

  return <section className="shipment-stock-outcome" aria-label="Resultado da separação no estoque">
    <h3>Entrada efetivada no estoque da Revisão</h3>
    {movements.length === 0 ? <p>Retorno integral: nenhuma quantidade entrou no estoque.</p> : movements.map((movement) => <div key={movement.id}>
      {!movement.items ? <p>Carregando itens da entrada…</p> : <ul className="movement-detail-items">{movement.items.map((item) => <li key={item.id}>
        <strong>{item.productSnapshot?.code ?? 'Produto'} — {item.productSnapshot?.name ?? 'Descrição não registrada'}</strong>
        <span>Lote {item.batch.code}</span>
        <b>{item.quantity} {item.productSnapshot?.defaultUnit ?? ''} adicionados ao estoque</b>
      </li>)}</ul>}
      <p className="muted">Movimentação {movement.codigoMovimentacao ?? movement.id} · {formatDateTime(movement.occurredAt)}</p>
      {onOpenMovement && <button type="button" className="secondary" onClick={() => onOpenMovement(movement.id)}>Ver movimentação de entrada</button>}
    </div>)}
  </section>;
}
