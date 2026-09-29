import { ReactNode } from 'react';
import { formatDate, formatRecordDateTime } from './format';

export interface MovementRecordRowProps {
  code: string | null | undefined;
  occurredAt: string;
  status: string;
  statusTone: 'active' | 'pending' | 'warning' | 'canceled';
  productCode: string | null | undefined;
  productName: string | null | undefined;
  batchCode: string | null | undefined;
  manufacturingDate: string | null | undefined;
  unit: string | null | undefined;
  quantity: number | null | undefined;
  origin: string;
  destination: string;
  sentBy: string | null | undefined;
  receivedBy: string | null | undefined;
  pcpExecutedBy: string | null | undefined;
  receiptRequired: boolean;
  pcpRequired: boolean;
  receiptPlaceholder?: string;
  pcpPlaceholder?: string;
  onOpen: () => void;
  action?: ReactNode;
}

function RecordFact({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return <div className="record-line-fact" title={`${label}: ${value}`}><span>{label}</span><strong className={muted ? 'record-line-pending' : undefined}>{value}</strong></div>;
}

export function MovementRecordRow({ code, occurredAt, status, statusTone, productCode, productName, batchCode,
  manufacturingDate, unit, quantity, origin, destination, sentBy, receivedBy, pcpExecutedBy,
  receiptRequired, pcpRequired, receiptPlaceholder = 'Pendente', pcpPlaceholder = 'Pendente', onOpen, action }: MovementRecordRowProps) {
  const receipt = receiptRequired ? receivedBy ?? receiptPlaceholder : 'Não se aplica';
  const pcp = pcpRequired ? pcpExecutedBy ?? pcpPlaceholder : 'Não necessário';
  return <article className="movement-record-line">
    <button type="button" className="movement-record-line-main" onClick={onOpen}>
      <div className="movement-record-line-header">
        <strong title={code ?? 'Sem código público'}>{code ?? 'Sem código público'}</strong>
        <time dateTime={occurredAt}>{formatRecordDateTime(occurredAt)}</time>
        <span className={`badge ${statusTone}`}>{status}</span>
      </div>
      <div className="movement-record-line-fields">
        <RecordFact label="Produto" value={[productCode, productName].filter(Boolean).join(' · ') || 'Produto não informado'} />
        <RecordFact label="Lote · prod." value={`${batchCode ?? '—'} · ${manufacturingDate ? formatDate(manufacturingDate) : '—'}`} />
        <RecordFact label="Quantidade" value={`${quantity ?? '—'} ${unit ?? ''}`.trim()} />
        <RecordFact label="Origem → destino" value={`${origin} → ${destination}`} />
        <RecordFact label="Enviou" value={sentBy ?? 'Pendente'} muted={!sentBy} />
        <RecordFact label="Recebeu" value={receipt} muted={receiptRequired && !receivedBy} />
        <RecordFact label="PCP" value={pcp} muted={pcpRequired && !pcpExecutedBy} />
      </div>
    </button>
    {action && <div className="movement-record-line-action">{action}</div>}
  </article>;
}
