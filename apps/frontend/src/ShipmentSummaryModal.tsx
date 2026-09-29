import { useEffect, useState } from 'react';
import { api, UserSession } from './api';
import { LoadingState, Modal, Notice } from './components';
import { ShipmentDetailView } from './ShipmentDetailView';
import { Shipment } from './shipments';

export function ShipmentSummaryModal({ id, user, onClose, onOpen, onOpenMovement, recordId, onSelectRecord, onViewGroup }: {
  id: string; user: UserSession; onClose: () => void; onOpen: (id: string) => void; onOpenMovement?: (id: string) => void;
  recordId?: string | null; onSelectRecord?: (id: string) => void; onViewGroup?: () => void;
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
    {!shipment && <div className="panel-heading"><h2 id="shipment-summary-title">Detalhes do envio</h2><button className="secondary" onClick={onClose}>Fechar</button></div>}
    {error && <Notice kind="error">{error}</Notice>}
    {!shipment && !error && <LoadingState label="Carregando resumo" />}
    {shipment && <ShipmentDetailView shipment={shipment} titleId="shipment-summary-title" recordId={recordId} onSelectRecord={onSelectRecord} onViewGroup={onViewGroup} onClose={onClose} onOpenShipment={onOpen} onOpenMovement={onOpenMovement}
      actions={<button type="button" onClick={() => onOpen(shipment.id)}>{canDecide && shipment.status === 'EM_SEPARACAO' ? 'Continuar separação' : canDecide && shipment.status === 'AGUARDANDO_RECEBIMENTO' ? shipment.shipmentKind === 'RETORNO_IMEDIATO' ? 'Confirmar retorno' : 'Confirmar recebimento' : 'Ver detalhes completos'}</button>} />}
  </Modal>;
}
