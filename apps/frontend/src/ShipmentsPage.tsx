import { useCallback, useEffect, useRef, useState } from 'react';
import { api, Paginated, UserSession } from './api';
import { EmptyState, LoadingState, Modal, Notice, PageHeader } from './components';
import { formatDate, formatDateTime } from './format';
import { NewShipment } from './NewShipment';
import { useMovementSubmission } from './useMovementSubmission';
import { Sector, sectorLabel, Shipment, shipmentStatusLabel } from './shipments';
import { PhotoViewer } from './PhotoViewer';

function ShipmentPhoto({ shipmentId, itemId, productName, available }: { shipmentId: string; itemId: string; productName: string; available: boolean }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!available) return;
    let active = true; let objectUrl = '';
    void api.getBlob(`/shipments/${shipmentId}/items/${itemId}/photo`).then((blob) => {
      if (!active) return; objectUrl = URL.createObjectURL(blob); setUrl(objectUrl);
    }).catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : 'Não foi possível carregar a foto.'); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [available, itemId, shipmentId]);
  if (!available) return <span className="muted">Item histórico sem foto.</span>;
  if (error) return <span className="photo-required">{error}</span>;
  if (!url) return <span className="muted">Carregando foto…</span>;
  return <PhotoViewer src={url} alt={`Foto de ${productName}`} status="Toque para ampliar e conferir" />;
}

function ShipmentItems({ shipment }: { shipment: Shipment }) {
  return <ul className="movement-detail-items shipment-items">{shipment.items.map((item) => <li className="shipment-item-card" key={item.id}>
    <div className="shipment-item-heading"><strong>{item.productSnapshot.code} — {item.productSnapshot.name}</strong><b>{item.quantity} {item.productSnapshot.defaultUnit}</b></div>
    <div className="shipment-item-data"><span>Lote {item.batch.code} · fabricação {formatDate(item.batch.manufacturingDate)}</span>
      <span>Validade {formatDate(item.batch.expirationDate)}</span>
      {item.stockLocation && <span>Origem: {item.stockLocation.name}</span>}
      {item.observation && <span><strong>Observação do produto:</strong> {item.observation}</span>}
    </div>
    <ShipmentPhoto shipmentId={shipment.id} itemId={item.id} productName={item.productSnapshot.name} available={Boolean(item.photoMimeType)} />
  </li>)}</ul>;
}

function ShipmentDecision({ shipment, refuse, onClose, onDone }: { shipment: Shipment; refuse: boolean; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const submission = useMovementSubmission(`/shipments/${shipment.id}/${refuse ? 'refusal' : 'confirmation'}`, onDone, false);
  return <Modal labelledBy="shipment-decision-title" busy={submission.busy} onClose={onClose}>
    <h2 id="shipment-decision-title">{refuse ? 'Recusar envio' : 'Confirmar recebimento'}</h2>
    {shipment.observation && <p><strong>Observação geral:</strong> {shipment.observation}</p>}
    <ShipmentItems shipment={shipment} />
    <p>{refuse ? shipment.originSector === 'REVISAO' ? 'O saldo em trânsito voltará às posições originais da Revisão.' : 'Nenhum saldo será adicionado à Revisão.' : shipment.destinationSector === 'REVISAO' ? 'Os itens serão adicionados a A Revisar.' : 'A saída será concluída. O saldo reservado não será descontado novamente.'}</p>
    <form onSubmit={(event) => { event.preventDefault(); void submission.submit(refuse ? { reason } : {}); }}>
      {refuse && <label>Motivo da recusa *<textarea required maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} rows={3} disabled={submission.busy} /></label>}
      {submission.conflict && <Notice kind="info">{submission.conflict.message}</Notice>}
      {submission.error && <Notice kind="error">{submission.error}</Notice>}
      <div className="dialog-actions"><button type="button" className="secondary" disabled={submission.busy} onClick={onClose}>Voltar</button><button disabled={submission.busy || (refuse && !reason.trim())}>{submission.busy ? 'Processando…' : refuse ? 'Confirmar recusa' : submission.conflict ? 'Aceitar validade diferente e receber' : 'Confirmar recebimento'}</button></div>
    </form>
  </Modal>;
}

export function ShipmentsPage({ user }: { user: UserSession }) {
  const [view, setView] = useState<'pending' | 'sent' | 'history'>('pending');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<Shipment> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Shipment | null>(null);
  const [decision, setDecision] = useState<'confirm' | 'refuse' | null>(null);
  const canCreate = user.permissions.includes('shipments.create');
  const canDecide = user.permissions.includes('shipments.decide');
  const requestVersion = useRef(0);
  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true); setError('');
    try {
      const result = await api.get<Paginated<Shipment>>(`/shipments?view=${view}&page=${page}&limit=10`);
      if (version === requestVersion.current) setData(result);
    }
    catch (caught) { if (version === requestVersion.current) setError(caught instanceof Error ? caught.message : 'Não foi possível carregar os envios.'); }
    finally { if (version === requestVersion.current) setLoading(false); }
  }, [view, page]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => { requestVersion.current += 1; window.clearTimeout(timer); }; }, [load]);
  // Poll only the list; never replace an open confirmation or an unsent draft.
  useEffect(() => {
    if (selected || creating) return;
    const timer = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(timer);
  }, [load, selected, creating]);
  if (creating) return <NewShipment sector={user.sector as Sector} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); setSelected(null); setView('sent'); setPage(1); setSuccess('Envio criado. Aguardando confirmação do destinatário.'); void load(); }} />;
  return <>
    {user.sector !== 'REVISAO' && <ShipmentHomeNotice onOpen={() => { setView('pending'); setPage(1); }} />}
    <PageHeader eyebrow={sectorLabel[user.sector as Sector]} title="Envios entre setores" description="Receba, acompanhe seus envios e consulte as decisões." action={canCreate && <button onClick={() => setCreating(true)}>{user.sector === 'REVISAO' ? 'Novo envio' : 'Novo envio para Revisão'}</button>} />
    {success && <Notice kind="success" onClose={() => setSuccess('')}>{success}</Notice>}
    <nav className="shipment-tabs" aria-label="Consultas de envios">{([['pending','Aguardando minha ação'],['sent','Enviados por mim'],['history','Histórico']] as const).map(([key,label]) => <button key={key} className={view === key ? '' : 'secondary'} aria-pressed={view === key} onClick={() => { setView(key); setPage(1); setSelected(null); }}>{label}</button>)}</nav>
    {error ? <Notice kind="error">{error} <button className="secondary" onClick={() => void load()}>Tentar novamente</button></Notice> : loading ? <LoadingState label="Consultando envios" /> : !data?.items.length ? <EmptyState title="Nenhum envio nesta consulta" description="Novos recebimentos e decisões aparecerão aqui." /> : <>
      <div className="shipment-list">{data.items.map((shipment) => <article className="surface shipment-card" key={shipment.id}>
        <span className={`badge ${shipment.status === 'CONFIRMADO' ? 'active' : shipment.status === 'RECUSADO' ? 'canceled' : ''}`}>{shipmentStatusLabel[shipment.status]}</span>
        <h2>{sectorLabel[shipment.originSector]} → {sectorLabel[shipment.destinationSector]}</h2>
        <p>{shipment.createdBy.username} · {formatDateTime(shipment.createdAt)}</p><p>{shipment.items.length} item(ns)</p>
        {shipment.originSector === 'REVISAO' && shipment.status === 'AGUARDANDO_RECEBIMENTO' && <p><strong>Quantidade em trânsito, fora do saldo disponível.</strong></p>}
        {shipment.decidedAt && <p>{shipmentStatusLabel[shipment.status]} por {shipment.decidedBy?.username} em {formatDateTime(shipment.decidedAt)}</p>}
        {shipment.refusalReason && <Notice kind="info">Motivo da recusa: {shipment.refusalReason}</Notice>}
        <button className="secondary button-wide" onClick={() => { setSelected(shipment); setDecision(null); }}>Ver itens e detalhes</button>
      </article>)}</div>
      <div className="shipment-pagination"><button className="secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Anterior</button><span>Página {page} de {data.meta.totalPages} · {data.meta.total} envios</span><button className="secondary" disabled={page >= data.meta.totalPages} onClick={() => setPage((value) => value + 1)}>Próxima</button></div>
    </>}
    {selected && !decision && <Modal labelledBy="shipment-detail-title" onClose={() => setSelected(null)}>
      <h2 id="shipment-detail-title">{sectorLabel[selected.originSector]} → {sectorLabel[selected.destinationSector]}</h2>
      <p><strong>{shipmentStatusLabel[selected.status]}</strong></p><p>Enviado por {selected.createdBy.username} em {formatDateTime(selected.createdAt)}</p>
      <small className="shipment-id">Envio {selected.id}</small>
      {selected.observation && <p><strong>Observação geral:</strong> {selected.observation}</p>}
      <ShipmentItems shipment={selected} />
      {selected.decidedAt && <p>{shipmentStatusLabel[selected.status]} por {selected.decidedBy?.username} em {formatDateTime(selected.decidedAt)}</p>}
      {selected.refusalReason && <Notice kind="info">Motivo da recusa: {selected.refusalReason}</Notice>}
      {canDecide && selected.status === 'AGUARDANDO_RECEBIMENTO' && selected.destinationSector === user.sector && <div className="dialog-actions"><button className="secondary" onClick={() => setDecision('refuse')}>Recusar envio</button><button onClick={() => setDecision('confirm')}>Confirmar recebimento</button></div>}
      {canCreate && selected.status === 'RECUSADO' && selected.createdBy.id === user.id && <button className="button-wide" onClick={() => { setSelected(null); setCreating(true); }}>Criar novo envio</button>}
      <button className="secondary button-wide" onClick={() => setSelected(null)}>Fechar detalhes</button>
    </Modal>}
    {selected && decision && <ShipmentDecision key={`${selected.id}:${decision}`} shipment={selected} refuse={decision === 'refuse'} onClose={() => setDecision(null)} onDone={() => { setSuccess(decision === 'refuse' ? 'Envio recusado. O remetente poderá consultar o motivo.' : 'Recebimento confirmado com sucesso.'); setDecision(null); setSelected(null); void load(); }} />}
  </>;
}

export function ShipmentHomeNotice({ onOpen }: { onOpen: () => void }) {
  const [pending, setPending] = useState<number | null>(null);
  const [sent, setSent] = useState<Shipment[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const load = () => void Promise.all([api.get<Paginated<Shipment>>('/shipments?view=pending&limit=1'), api.get<Paginated<Shipment>>('/shipments?view=updates&limit=3')])
      .then(([p,s]) => { if (active) { setPending(p.meta.total); setSent(s.items); setError(''); } })
      .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : 'Erro ao consultar pendências.'); });
    load(); const timer = window.setInterval(load, 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  return <section className="surface shipment-card"><p className="eyebrow">Envios entre setores</p><h2>Aguardando meu recebimento</h2>
    {error ? <Notice kind="error">{error}</Notice> : pending === null ? <LoadingState label="Consultando pendências" /> : <p><strong>{pending}</strong> envio(s) aguardando sua ação.</p>}
    <button onClick={onOpen}>Abrir envios e recebimentos</button>
    {sent.length > 0 && <><h3>Atualizações dos seus envios</h3><ul className="movement-detail-items">{sent.map((shipment) => <li key={shipment.id}><strong>{sectorLabel[shipment.destinationSector]} · {shipmentStatusLabel[shipment.status]}</strong><span>{formatDateTime(shipment.decidedAt ?? shipment.createdAt)}</span>{shipment.refusalReason && <span>Motivo: {shipment.refusalReason}</span>}</li>)}</ul></>}
  </section>;
}
