import { ReactNode } from 'react';
import { formatDateTime } from './format';
import { ShipmentItems } from './ShipmentItems';
import { ShipmentStockOutcome } from './ShipmentStockOutcome';
import { Shipment, sectorLabel, shipmentStatusLabel } from './shipments';

export function ShipmentDetailView({ shipment, titleId, recordId, onSelectRecord, onViewGroup, onClose, onOpenShipment, onOpenMovement, audit, actions }: {
  shipment: Shipment;
  titleId: string;
  recordId?: string | null;
  onSelectRecord?: (id: string) => void;
  onViewGroup?: () => void;
  onClose: () => void;
  onOpenShipment?: (id: string) => void;
  onOpenMovement?: (id: string) => void;
  audit?: ReactNode;
  actions?: ReactNode;
}) {
  const selectedItem = recordId ? shipment.items.find((item) => item.id === recordId) : null;
  const visibleShipment = selectedItem ? {
    ...shipment,
    items: [selectedItem],
    movements: shipment.movements?.map((movement) => ({ ...movement,
      items: movement.items?.filter((item) => item.shipmentItemId === selectedItem.id),
    })).filter((movement) => movement.items?.length),
  } : shipment;
  const movements = visibleShipment.movements ?? [];
  const executable = movements.filter((movement) => movement.requiresPcpExecution);
  const pcpLabel = shipment.status !== 'CONFIRMADO' || !movements.length ? null
    : !executable.length ? 'Não necessário'
      : executable.every((movement) => movement.pcpExecutionStatus === 'EXECUTADA') ? 'Executada'
        : executable.some((movement) => movement.pcpExecutionStatus === 'EXECUTADA') ? 'Parcial' : 'Pendente';
  const title = shipment.shipmentKind === 'MONTAGEM' ? 'Envio com montagem'
    : shipment.shipmentKind === 'RETORNO_IMEDIATO' ? 'Envio de retorno' : 'Envio entre setores';
  const decidedBy = shipment.receivedBy?.username ?? shipment.decidedBy?.username;
  const awaitingDecision = shipment.status === 'AGUARDANDO_RECEBIMENTO';
  const decisionLabel = shipment.status === 'CANCELADO' ? 'Cancelado por'
    : shipment.status === 'CONFIRMADO' || shipment.status === 'EM_SEPARACAO' ? 'Recebido por' : 'Decisão por';
  const decisionActor = shipment.status === 'CANCELADO' ? shipment.createdBy.username
    : decidedBy ?? (awaitingDecision ? 'Pendente' : 'Não informado');

  return <>
    <div className="panel-heading movement-detail-heading"><div className="movement-detail-heading-content">
      <p className="eyebrow">Detalhes do envio</p>
      <h2 id={titleId}>{title}</h2>
      <div className="movement-detail-heading-meta">
        <code>{recordId && !selectedItem ? 'Registro não encontrado' : selectedItem?.codigoRegistro ?? shipment.codigoMovimentacao}</code>
        <span className={`badge ${shipment.status === 'CONFIRMADO' ? 'active' : ['RECUSADO', 'CANCELADO'].includes(shipment.status) ? 'canceled' : 'pending'}`}>{shipmentStatusLabel[shipment.status]}</span>
        {pcpLabel && <span className={`badge ${pcpLabel === 'Executada' ? 'active' : pcpLabel === 'Não necessário' ? '' : 'pending'}`}>PCP: {pcpLabel}</span>}
      </div>
      {recordId && <div className="movement-detail-group">Grupo {shipment.codigoMovimentacao} · {shipment.items.length} {shipment.items.length === 1 ? 'registro' : 'registros'} {onViewGroup && <button type="button" className="text-button" onClick={onViewGroup}>Ver grupo</button>}</div>}
    </div><button type="button" className="secondary" onClick={onClose}>Fechar</button></div>

    <section className="movement-route" aria-label="Origem e destino">
      <div className="movement-route-place"><span>Origem</span><strong>{sectorLabel[shipment.originSector]}</strong></div>
      <span className="movement-route-arrow" aria-hidden="true">→</span>
      <div className="movement-route-place"><span>Destino</span><strong>{sectorLabel[shipment.destinationSector]}</strong></div>
    </section>

    {shipment.loadingStatus && <section className="movement-detail-section" aria-labelledby="shipment-loading-title">
      <h3 id="shipment-loading-title">Carregamento</h3>
      <div className="movement-facts"><div><span>Situação</span><strong>{shipment.loadingStatus === 'CARREGADO' ? 'Carregado' : 'Não carregado'}</strong></div>
        {shipment.vehiclePlate && <div><span>Placa do veículo</span><strong>{shipment.vehiclePlate}</strong></div>}</div>
    </section>}

    <section className="movement-detail-section" aria-labelledby="shipment-products-title">
      <h3 id="shipment-products-title">Produtos e quantidades</h3>
      {recordId && !selectedItem ? <p className="muted">Este registro não foi encontrado no envio.</p>
        : <ShipmentItems shipment={visibleShipment} onSelectRecord={recordId ? undefined : onSelectRecord} collapsePhotos />}
    </section>

    <section className="movement-detail-section" aria-labelledby="shipment-facts-title">
      <h3 id="shipment-facts-title">Responsáveis e data</h3>
      <div className="movement-facts">
        <div><span>Enviado por</span><strong>{shipment.createdBy.username}</strong></div>
        <div><span>Data e hora</span><strong>{formatDateTime(shipment.createdAt)}</strong></div>
        <div><span>{decisionLabel}</span><strong>{decisionActor}</strong></div>
        <div><span>Data da decisão</span><strong>{shipment.decidedAt ? formatDateTime(shipment.decidedAt) : awaitingDecision ? 'Pendente' : 'Não informada'}</strong></div>
        {shipment.separationStartedAt && <div><span>Início da separação</span><strong>{formatDateTime(shipment.separationStartedAt)}</strong></div>}
        {shipment.separationExpiresAt && <div><span>Prazo da separação</span><strong>{formatDateTime(shipment.separationExpiresAt)}</strong></div>}
        {shipment.separationCompletedAt && <div><span>Separação concluída</span><strong>{formatDateTime(shipment.separationCompletedAt)}</strong></div>}
      </div>
    </section>

    <ShipmentStockOutcome shipment={visibleShipment} onOpenMovement={onOpenMovement} />

    {(shipment.observation || shipment.refusalReason) && <section className="movement-detail-section movement-notes" aria-labelledby="shipment-notes-title">
      <h3 id="shipment-notes-title">Observações</h3>
      {shipment.observation && <p>{shipment.observation}</p>}
      {shipment.refusalReason && <p><strong>{shipment.status === 'CANCELADO' ? 'Motivo do cancelamento:' : 'Motivo da recusa:'}</strong> {shipment.refusalReason}</p>}
    </section>}

    {(shipment.sourceShipmentId || shipment.derivedShipments?.length) && onOpenShipment && <section className="movement-detail-section shipment-related" aria-labelledby="shipment-related-title">
      <h3 id="shipment-related-title">Envios vinculados</h3>
      {shipment.sourceShipmentId && <button type="button" className="secondary" onClick={() => onOpenShipment(shipment.sourceShipmentId!)}>Ver recebimento original · {shipment.sourceShipment?.codigoMovimentacao ?? shipment.sourceShipmentId}</button>}
      {shipment.derivedShipments?.map((derived) => <button type="button" className="secondary" key={derived.id} onClick={() => onOpenShipment(derived.id)}>Ver retorno · {shipmentStatusLabel[derived.status]}</button>)}
    </section>}

    {audit}
    {actions && <div className="movement-detail-footer">{actions}</div>}
  </>;
}
