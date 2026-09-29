import type { HistoryItem } from './HistoryPage';
import { MovementRecordRow } from './MovementRecordRow';

const openStatus: Record<string, string> = {
  AGUARDANDO_RECEBIMENTO: 'Aguardando recebimento', EM_SEPARACAO: 'Em separação',
};

export function HistoryRecordRow({ item, onOpen }: { item: HistoryItem; onOpen: () => void }) {
  const closed = item.scope === 'CLOSED';
  const status = item.scope === 'OPEN' ? openStatus[item.status] ?? 'Em andamento'
    : item.scope === 'PENDING_PCP' ? 'Aguardando PCP' : closed ? 'Encerrada' : 'Finalizada';
  return <MovementRecordRow
    code={item.code} occurredAt={item.occurredAt} status={status}
    statusTone={closed ? 'canceled' : item.scope === 'DONE' ? 'active' : item.scope === 'OPEN' ? 'warning' : 'pending'}
    productCode={item.productCode} productName={item.productName} batchCode={item.batchCode}
    manufacturingDate={item.manufacturingDate} unit={item.productUnit} quantity={item.quantity}
    origin={item.origin} destination={item.destination} sentBy={item.sentBy ?? item.responsible}
    receivedBy={item.receivedBy} pcpExecutedBy={item.pcpExecutedBy}
    receiptRequired={item.kind === 'SHIPMENT' || Boolean(item.parentShipmentId)}
    pcpRequired={Boolean(item.pcpRequired)}
    reviewDistributions={item.type === 'REVISAO' ? item.reviewDistributions : undefined}
    reviewDistributionUnit={item.reviewDistributionUnit}
    receiptPlaceholder={closed ? 'Não realizado' : 'Pendente'}
    pcpPlaceholder={closed ? 'Não realizado' : 'Pendente'} onOpen={onOpen}
  />;
}
