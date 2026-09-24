import { useEffect, useState } from 'react';
import { api, UserSession } from './api';
import { LoadingState, Modal, Notice } from './components';
import { ShipmentItems } from './ShipmentsPage';
import { formatDateTime } from './format';
import { Shipment, sectorLabel, shipmentStatusLabel } from './shipments';

export function ShipmentSummaryModal({ id, user, onClose, onOpen }: {
  id: string; user: UserSession; onClose: () => void; onOpen: (id: string) => void;
}) {
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void api.get<Shipment>(`/shipments/${id}`).then((value) => { if (active) setShipment(value); })
      .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : 'Não foi possível consultar o envio.'); });
    return () => { active = false; };
  }, [id]);
  const canDecide = shipment?.destinationSector === user.sector && user.permissions.includes('shipments.decide');
  return <Modal labelledBy="shipment-summary-title" className="shipment-detail-dialog" onClose={onClose}>
    <div className="panel-heading"><h2 id="shipment-summary-title">Resumo do envio</h2><button className="secondary" onClick={onClose}>Fechar</button></div>
    {error && <Notice kind="error">{error}</Notice>}
    {!shipment && !error && <LoadingState label="Carregando resumo" />}
    {shipment && <>
      <p><strong>{shipment.codigoMovimentacao}</strong></p>
      <h3>{sectorLabel[shipment.originSector]} → {sectorLabel[shipment.destinationSector]}</h3>
      <dl><dt>Status</dt><dd>{shipmentStatusLabel[shipment.status]}</dd><dt>Enviado por</dt><dd>{shipment.createdBy.username}</dd><dt>Data/hora</dt><dd>{formatDateTime(shipment.createdAt)}</dd>
        {shipment.decidedAt && <><dt>Decisão</dt><dd>{shipment.decidedBy?.username} · {formatDateTime(shipment.decidedAt)}</dd></>}
        {shipment.separationStartedAt && <><dt>Início da separação</dt><dd>{formatDateTime(shipment.separationStartedAt)}</dd></>}
        {shipment.separationExpiresAt && <><dt>Prazo da separação</dt><dd>{formatDateTime(shipment.separationExpiresAt)}</dd></>}
        {shipment.movements?.map((movement) => <div key={movement.id}><dt>PCP · {movement.codigoMovimentacao}</dt><dd>{!movement.requiresPcpExecution ? 'Não necessária' : movement.pcpExecutionStatus === 'EXECUTADA' ? 'Executada' : 'Pendente'}</dd></div>)}
      </dl>
      {shipment.observation && <p><strong>Observação:</strong> {shipment.observation}</p>}
      {shipment.refusalReason && <p><strong>{shipment.status === 'CANCELADO' ? 'Motivo do cancelamento:' : 'Motivo da recusa:'}</strong> {shipment.refusalReason}</p>}
      <ShipmentItems shipment={shipment} />
      <div className="dialog-actions">
        {shipment.sourceShipmentId && <button className="secondary" onClick={() => onOpen(shipment.sourceShipmentId!)}>Ver recebimento original</button>}
        {shipment.derivedShipments?.map((derived) => <button className="secondary" key={derived.id} onClick={() => onOpen(derived.id)}>Ver retorno · {shipmentStatusLabel[derived.status]}</button>)}
        <button onClick={() => onOpen(shipment.id)}>{canDecide && shipment.status === 'EM_SEPARACAO' ? 'Continuar separação' : canDecide && shipment.status === 'AGUARDANDO_RECEBIMENTO' ? shipment.shipmentKind === 'RETORNO_IMEDIATO' ? 'Confirmar retorno' : 'Confirmar recebimento' : 'Ver detalhes completos'}</button>
      </div>
    </>}
  </Modal>;
}
