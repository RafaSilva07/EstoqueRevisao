import { ReactNode, useEffect, useState } from 'react';
import { api, Movement, PcpMovementDetail } from './api';
import { LoadingState, Modal, Notice } from './components';
import { formatDate, formatDateTime } from './format';
import { ShipmentPhoto } from './ShipmentsPage';
import { Shipment } from './shipments';
import { MovementEvidence } from './MovementEvidence';

const typeLabel: Record<Movement['type'], string> = {
  ENTRADA_EXTERNA: 'Entrada externa',
  SAIDA_EXTERNA: 'Saída externa',
  TRANSFERENCIA_INTERNA: 'Transferência interna',
  REVISAO: 'Revisão',
};

export function MovementDetailModal({ movementId, initialMovement, onClose, children, pcp = false }: {
  movementId: string;
  pcp?: boolean;
  initialMovement?: Movement;
  onClose: () => void;
  children?: (movement: Movement) => ReactNode;
}) {
  const [loadedMovement, setLoadedMovement] = useState<Movement | null>(null);
  const [error, setError] = useState('');
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const movement = initialMovement?.id === movementId ? initialMovement : loadedMovement?.id === movementId ? loadedMovement : null;
  const destinations = movement?.destinationLocation
    ? [movement.destinationLocation.name]
    : [...new Set(movement?.items.flatMap((item) => item.distributions?.map((distribution) => distribution.destinationLocation.name) ?? []) ?? [])];

  useEffect(() => {
    if (initialMovement?.id === movementId) return;
    let active = true;
    void api.get<Movement>(`${pcp ? '/pcp' : ''}/movements/${movementId}`)
      .then((result) => { if (active) setLoadedMovement(result); })
      .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : 'Não foi possível carregar os detalhes.'); });
    return () => { active = false; };
  }, [initialMovement, movementId, pcp]);

  useEffect(() => {
    if (!movement?.shipmentId || pcp) return;
    let active = true;
    void api.get<Shipment>(`/shipments/${movement.shipmentId}`).then((value) => { if (active) setShipment(value); })
      .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : 'Não foi possível consultar as evidências.'); });
    return () => { active = false; };
  }, [movement?.shipmentId, pcp]);

  return <Modal labelledBy="movement-detail-title" className="movement-detail-dialog" onClose={onClose}>
    {!movement && <div className="panel-heading"><h2 id="movement-detail-title">Resumo da movimentação</h2><button className="secondary" onClick={onClose}>Fechar</button></div>}
    {!movement && !error && <LoadingState label="Carregando detalhes" />}
    {error && <Notice kind="error">{error}</Notice>}
    {movement && <>
      <div className="panel-heading movement-detail-heading"><div><p className="eyebrow">Detalhes da movimentação</p><h2 id="movement-detail-title">{typeLabel[movement.type]}</h2></div><button className="secondary" onClick={onClose}>Fechar</button></div>
      <section className="movement-route" aria-label="Origem e destino">
        <div className="movement-route-place"><span>Origem</span><strong>{movement.originLocation.name}</strong></div>
        <span className="movement-route-arrow" aria-hidden="true">→</span>
        <div className="movement-route-place"><span>Destino</span><strong>{destinations.length ? destinations.join(' · ') : 'Distribuição da revisão'}</strong></div>
      </section>
      <section className="movement-detail-section" aria-labelledby="movement-products-title">
      <h3 id="movement-products-title">Produtos e quantidades</h3>
      <ul className="movement-detail-items">{movement.items.map((item) => {
        const evidence = pcp
          ? (movement as PcpMovementDetail).shipmentEvidence?.filter((photo) => photo.productId === item.productId && photo.batchId === item.batchId && (photo.photoMimeType || photo.additionalPhotos?.length)) ?? []
          : shipment?.items.filter((photo) => photo.productId === item.productId && photo.batchId === item.batchId
            && (!photo.stockLocationId || photo.stockLocationId === movement.originLocationId) && (photo.photoMimeType || photo.additionalPhotos?.length)) ?? [];
        return <li key={item.id}>
        <strong>{(item.productSnapshot ?? item.product).code} — {(item.productSnapshot ?? item.product).name}</strong>
        {movement.type === 'TRANSFERENCIA_INTERNA' ? <>
          <span>Origem: lote {item.batch.code} · fabricação {formatDate(item.batch.manufacturingDate)} · validade {formatDate(item.batch.expirationDate)} · {movement.originLocation.name}</span>
          <span>Destino: lote {item.destinationBatch?.code} · fabricação {formatDate(item.destinationBatch?.manufacturingDate ?? '')} · validade {formatDate(item.destinationBatch?.expirationDate ?? '')} · {movement.destinationLocation?.name}</span>
        </> : <span>Lote {item.batch.code} · fabricação {formatDate(item.batch.manufacturingDate)} · validade {formatDate(item.batch.expirationDate)}</span>}
        <b>{item.quantity} {(item.productSnapshot ?? item.product).defaultUnit}</b>
        {item.outputProductSnapshot && <span>Desmontagem: {item.quantity} {(item.productSnapshot ?? item.product).defaultUnit} × {item.unitsPerPackage} → {item.outputQuantity} UN de {item.outputProductSnapshot.code} — {item.outputProductSnapshot.name}</span>}
        {item.distributions?.length > 0 && <ul className="distribution-detail">{item.distributions.map((distribution) => <li key={distribution.id}>{distribution.destinationLocation.name}: <strong>{distribution.quantity} {(item.outputProductSnapshot ?? item.productSnapshot ?? item.product).defaultUnit}</strong></li>)}</ul>}
        {evidence.length > 0 && <MovementEvidence key={`${movement.pcpExecutionStatus}:${item.id}`} pendingPcp={movement.status === 'EFETIVADA' && movement.requiresPcpExecution && movement.pcpExecutionStatus === 'PENDENTE'}>
          <div className="pcp-evidence-grid">{evidence.map((photo) => <ShipmentPhoto key={'itemId' in photo ? photo.itemId : photo.id} shipmentId={'itemId' in photo ? photo.shipmentId : shipment!.id} itemId={'itemId' in photo ? photo.itemId : photo.id} productName={(item.productSnapshot ?? item.product).name} available={Boolean(photo.photoMimeType)} additionalPhotos={photo.additionalPhotos} />)}</div>
        </MovementEvidence>}
      </li>})}</ul>
      </section>
      <section className="movement-detail-section" aria-labelledby="movement-info-title">
        <h3 id="movement-info-title">Dados da movimentação</h3>
        <div className="movement-facts">
          <div><span>Responsável</span><strong>{movement.responsibleUser.username}</strong></div>
          <div><span>Data e hora</span><strong>{formatDateTime(movement.occurredAt)}</strong></div>
          <div><span>Código</span><strong>{movement.codigoMovimentacao ?? 'Não se aplica'}</strong>{shipment && <small>Envio original: {shipment.codigoMovimentacao}</small>}</div>
          <div><span>Status</span><strong><span className={`badge ${movement.status === 'EFETIVADA' ? 'active' : 'canceled'}`}>{movement.status === 'EFETIVADA' ? 'Efetivada' : 'Cancelada'}</span></strong><small>PCP: {movement.requiresPcpExecution === false ? 'Não necessária' : movement.pcpExecutionStatus === 'EXECUTADA' ? 'Executada' : 'Pendente'}</small></div>
        </div>
        {movement.pcpExecutionStatus === 'EXECUTADA' && <p className="movement-detail-event">Executada no PCP por <strong>{movement.pcpExecutedByUser?.username ?? '—'}</strong> em {movement.pcpExecutedAt ? formatDateTime(movement.pcpExecutedAt) : '—'}.</p>}
        {movement.status === 'CANCELADA' && <p className="movement-detail-event">Cancelada por <strong>{movement.canceledByUser?.username ?? '—'}</strong> em {movement.canceledAt ? formatDateTime(movement.canceledAt) : '—'}.</p>}
      </section>
      {(movement.observation || movement.pcpExecutionObservation || movement.cancellationReason) && <section className="movement-detail-section movement-notes" aria-labelledby="movement-notes-title">
        <h3 id="movement-notes-title">Observações</h3>
        {movement.observation && <p>{movement.observation}</p>}
        {movement.pcpExecutionObservation && <p><strong>PCP:</strong> {movement.pcpExecutionObservation}</p>}
        {movement.cancellationReason && <p><strong>Motivo do cancelamento:</strong> {movement.cancellationReason}</p>}
      </section>}
      {children?.(movement)}
    </>}
  </Modal>;
}
