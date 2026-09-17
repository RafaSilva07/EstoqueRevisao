import { ReactNode, useEffect, useState } from 'react';
import { api, Movement } from './api';
import { LoadingState, Modal, Notice } from './components';
import { formatDate, formatDateTime } from './format';

const typeLabel: Record<Movement['type'], string> = {
  ENTRADA_EXTERNA: 'Entrada externa',
  SAIDA_EXTERNA: 'Saída externa',
  TRANSFERENCIA_INTERNA: 'Transferência interna',
  REVISAO: 'Revisão',
};

export function MovementDetailModal({ movementId, initialMovement, onClose, children }: {
  movementId: string;
  initialMovement?: Movement;
  onClose: () => void;
  children?: (movement: Movement) => ReactNode;
}) {
  const [loadedMovement, setLoadedMovement] = useState<Movement | null>(null);
  const [error, setError] = useState('');
  const movement = initialMovement?.id === movementId ? initialMovement : loadedMovement?.id === movementId ? loadedMovement : null;

  useEffect(() => {
    if (initialMovement?.id === movementId) return;
    let active = true;
    void api.get<Movement>(`/movements/${movementId}`)
      .then((result) => { if (active) setLoadedMovement(result); })
      .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : 'Não foi possível carregar os detalhes.'); });
    return () => { active = false; };
  }, [initialMovement, movementId]);

  return <Modal labelledBy="movement-detail-title" className="movement-detail-dialog" onClose={onClose}>
    {!movement && !error && <LoadingState label="Carregando detalhes" />}
    {error && <Notice kind="error">{error}</Notice>}
    {movement && <>
      <div className="panel-heading"><div><p className="eyebrow">Detalhes da movimentação</p><h2 id="movement-detail-title">{typeLabel[movement.type]} <small>#{movement.id.slice(0, 8)}</small></h2></div><button className="secondary" onClick={onClose}>Fechar</button></div>
      <dl>
        <dt>Identificador</dt><dd className="shipment-id">{movement.id}</dd>
        <dt>Status operacional</dt><dd><span className={`badge ${movement.status === 'EFETIVADA' ? 'active' : 'canceled'}`}>{movement.status === 'EFETIVADA' ? 'Efetivada' : 'Cancelada'}</span></dd>
        <dt>Status PCP</dt><dd><span className={`badge ${movement.pcpExecutionStatus === 'EXECUTADA' ? 'active' : 'pending'}`}>{movement.pcpExecutionStatus === 'EXECUTADA' ? 'Executada' : 'Pendente'}</span></dd>
        <dt>Data/hora</dt><dd>{formatDateTime(movement.occurredAt)}</dd>
        <dt>Responsável</dt><dd>{movement.responsibleUser.username}</dd>
        <dt>Origem</dt><dd>{movement.originLocation.name}</dd>
        <dt>Destino</dt><dd>{movement.destinationLocation?.name ?? 'Distribuição da revisão'}</dd>
        <dt>Observação</dt><dd>{movement.observation || '—'}</dd>
        {movement.pcpExecutionStatus === 'EXECUTADA' && <><dt>Executada no PCP por</dt><dd>{movement.pcpExecutedByUser?.username ?? '—'}</dd><dt>Execução PCP em</dt><dd>{movement.pcpExecutedAt ? formatDateTime(movement.pcpExecutedAt) : '—'}</dd><dt>Observação PCP</dt><dd>{movement.pcpExecutionObservation || '—'}</dd></>}
        {movement.status === 'CANCELADA' && <><dt>Cancelada em</dt><dd>{movement.canceledAt ? formatDateTime(movement.canceledAt) : '—'}</dd><dt>Cancelada por</dt><dd>{movement.canceledByUser?.username ?? '—'}</dd><dt>Motivo</dt><dd>{movement.cancellationReason || '—'}</dd></>}
      </dl>
      <div className="divider" />
      <h3>Itens</h3>
      <ul className="movement-detail-items">{movement.items.map((item) => <li key={item.id}>
        <strong>{(item.productSnapshot ?? item.product).code} — {(item.productSnapshot ?? item.product).name}</strong>
        {movement.type === 'TRANSFERENCIA_INTERNA' ? <>
          <span>Origem: lote {item.batch.code} · fabricação {formatDate(item.batch.manufacturingDate)} · validade {formatDate(item.batch.expirationDate)} · {movement.originLocation.name}</span>
          <span>Destino: lote {item.destinationBatch?.code} · fabricação {formatDate(item.destinationBatch?.manufacturingDate ?? '')} · validade {formatDate(item.destinationBatch?.expirationDate ?? '')} · {movement.destinationLocation?.name}</span>
        </> : <span>Lote {item.batch.code} · fabricação {formatDate(item.batch.manufacturingDate)} · validade {formatDate(item.batch.expirationDate)}</span>}
        <b>{item.quantity} {(item.productSnapshot ?? item.product).defaultUnit}</b>
        {item.outputProductSnapshot && <span>Desmontagem: {item.quantity} {(item.productSnapshot ?? item.product).defaultUnit} × {item.unitsPerPackage} → {item.outputQuantity} UN de {item.outputProductSnapshot.code} — {item.outputProductSnapshot.name}</span>}
        {item.distributions?.length > 0 && <ul className="distribution-detail">{item.distributions.map((distribution) => <li key={distribution.id}>{distribution.destinationLocation.name}: <strong>{distribution.quantity} {(item.outputProductSnapshot ?? item.productSnapshot ?? item.product).defaultUnit}</strong></li>)}</ul>}
      </li>)}</ul>
      {children?.(movement)}
    </>}
  </Modal>;
}
