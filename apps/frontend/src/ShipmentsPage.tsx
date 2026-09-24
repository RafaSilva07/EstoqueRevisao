import { useCallback, useEffect, useRef, useState } from 'react';
import { api, Paginated, UserSession } from './api';
import { EmptyState, LoadingState, Modal, Notice, PageHeader } from './components';
import { formatDate, formatDateTime } from './format';
import { NewShipment } from './NewShipment';
import { useMovementSubmission } from './useMovementSubmission';
import { ShipmentSector, sectorLabel, Shipment, ShipmentAuditEvent, shipmentStatusLabel } from './shipments';
import { PhotoViewer } from './PhotoViewer';
import { CameraModal } from './CameraModal';

export function ShipmentPhoto({ shipmentId, itemId, productName, available }: { shipmentId: string; itemId: string; productName: string; available: boolean }) {
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

export function ShipmentItems({ shipment }: { shipment: Shipment }) {
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
  const [immediateSeparation, setImmediateSeparation] = useState(false);
  const canSeparate = !refuse && shipment.originSector === 'EXPEDICAO' && shipment.destinationSector === 'REVISAO' && shipment.shipmentKind === 'NORMAL';
  const submission = useMovementSubmission(`/shipments/${shipment.id}/${refuse ? 'refusal' : 'confirmation'}`, onDone, false);
  return <Modal labelledBy="shipment-decision-title" busy={submission.busy} onClose={onClose}>
    <h2 id="shipment-decision-title">{refuse ? 'Recusar envio' : 'Confirmar recebimento'}</h2>
    {shipment.observation && <p><strong>Observação geral:</strong> {shipment.observation}</p>}
    <ShipmentItems shipment={shipment} />
    <p>{refuse ? shipment.originSector === 'REVISAO' ? 'O saldo em trânsito voltará às posições originais da Revisão.' : 'Nenhum saldo será adicionado à Revisão.' : shipment.destinationSector === 'REVISAO' ? 'Os itens serão adicionados a A Revisar.' : 'A saída será concluída. O saldo reservado não será descontado novamente.'}</p>
    <form onSubmit={(event) => { event.preventDefault(); void submission.submit(refuse ? { reason } : { immediateSeparation }); }}>
      {refuse && <label>Motivo da recusa *<textarea required maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} rows={3} disabled={submission.busy} /></label>}
      {canSeparate && <fieldset className="settings-options"><legend>A separação dos produtos bons será feita agora?</legend><label className="check-row"><input type="radio" name="separation" checked={!immediateSeparation} onChange={() => setImmediateSeparation(false)} />Não, receber todo o volume</label><label className="check-row"><input type="radio" name="separation" checked={immediateSeparation} onChange={() => setImmediateSeparation(true)} />Sim, separar agora</label></fieldset>}
      {submission.conflict && <Notice kind="info">{submission.conflict.message}</Notice>}
      {submission.error && <Notice kind="error">{submission.error}</Notice>}
      <div className="dialog-actions"><button type="button" className="secondary" disabled={submission.busy} onClick={onClose}>Voltar</button><button disabled={submission.busy || (refuse && !reason.trim())}>{submission.busy ? 'Processando…' : refuse ? 'Confirmar recusa' : submission.conflict ? 'Aceitar validade diferente e receber' : 'Confirmar recebimento'}</button></div>
    </form>
  </Modal>;
}

function ShipmentCancellation({ shipment, onClose, onDone }: { shipment: Shipment; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const submission = useMovementSubmission(`/shipments/${shipment.id}/cancellation`, onDone, false);
  return <Modal labelledBy="shipment-cancellation-title" busy={submission.busy} onClose={onClose}>
    <h2 id="shipment-cancellation-title">Cancelar envio {shipment.codigoMovimentacao}?</h2>
    <Notice kind="info">O envio permanecerá no histórico. Se houver saldo reservado pela Revisão, ele será devolvido às posições originais.</Notice>
    <form onSubmit={(event) => { event.preventDefault(); void submission.submit({ reason }); }}>
      <label>Motivo do cancelamento *<textarea required maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} rows={4} disabled={submission.busy} /></label>
      {submission.error && <Notice kind="error">{submission.error}</Notice>}
      <div className="dialog-actions"><button type="button" className="secondary" disabled={submission.busy} onClick={onClose}>Voltar</button><button className="danger" disabled={submission.busy || !reason.trim()}>{submission.busy ? 'Cancelando…' : 'Confirmar cancelamento'}</button></div>
    </form>
  </Modal>;
}

function SeparationDialog({ shipment, onClose, onDone }: { shipment: Shipment; onClose: () => void; onDone: () => void }) {
  const [quantities, setQuantities] = useState<Record<string, string>>(() => Object.fromEntries(shipment.items.map((item) => [item.id, String(item.separationDraft?.returnQuantity ?? 0)])));
  const [photos, setPhotos] = useState<Record<string, File>>({}); const [cameraItem, setCameraItem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [saved, setSaved] = useState(false);
  const payload = () => ({ items: shipment.items.map((item) => ({ shipmentItemId: item.id, returnQuantity: Number(quantities[item.id] || 0) })) });
  const valid = shipment.items.every((item) => Number.isSafeInteger(Number(quantities[item.id])) && Number(quantities[item.id]) >= 0 && Number(quantities[item.id]) <= item.quantity);
  const photosReady = shipment.items.every((item) => Number(quantities[item.id] || 0) === 0 || Boolean(photos[item.id]));
  async function save() { setBusy(true); setError(''); try { await api.patch(`/shipments/${shipment.id}/separation-draft`, payload()); setSaved(true); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Não foi possível salvar o rascunho.'); } finally { setBusy(false); } }
  async function complete() { if (!valid || !photosReady) return; setBusy(true); setError(''); try { const orderedFiles = shipment.items.filter((item) => Number(quantities[item.id] || 0) > 0).map((item) => photos[item.id]); await api.postMultipart(`/shipments/${shipment.id}/separation-completion`, payload(), orderedFiles); onDone(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Não foi possível concluir a separação.'); } finally { setBusy(false); } }
  return <Modal labelledBy="separation-title" busy={busy} onClose={onClose}><h2 id="separation-title">Separação imediata</h2><p>Informe somente o que retornará à Expedição. O restante entrará diretamente no estoque da Revisão.</p>
    {shipment.separationExpiresAt && <Notice kind="info">Concluir até {formatDateTime(shipment.separationExpiresAt)}.</Notice>}{error && <Notice kind="error">{error}</Notice>}{saved && <Notice kind="success">Rascunho salvo. O prazo continua correndo.</Notice>}
    <div className="separation-items">{shipment.items.map((item) => { const amount = Number(quantities[item.id] || 0); return <article className="shipment-item-card" key={item.id}><div className="shipment-item-heading"><strong>{item.productSnapshot.code} — {item.productSnapshot.name}</strong><b>Recebido: {item.quantity}</b></div><p>Lote {item.batch.code}</p><label>Quantidade de retorno<input type="number" inputMode="numeric" min="0" max={item.quantity} step="1" value={quantities[item.id] ?? '0'} onChange={(event) => { setQuantities((current) => ({ ...current, [item.id]: event.target.value })); setSaved(false); }} /></label>{amount > 0 && <button type="button" className={photos[item.id] ? 'secondary' : ''} onClick={() => setCameraItem(item.id)}>{photos[item.id] ? '✓ Trocar foto do retorno' : 'Adicionar foto obrigatória'}</button>}</article>; })}</div>
    <div className="dialog-actions"><button type="button" className="secondary" onClick={() => void save()} disabled={busy || !valid}>Salvar e sair</button><button type="button" onClick={() => void complete()} disabled={busy || !valid || !photosReady}>Concluir separação</button></div>
    {cameraItem && <CameraModal onClose={() => setCameraItem(null)} onUse={(file) => { setPhotos((current) => ({ ...current, [cameraItem]: file })); setCameraItem(null); }} />}
  </Modal>;
}

export function ShipmentsPage({ user, initialView = 'pending', initialCreating = false, showCreateAction = true, initialId }: { user: UserSession; initialView?: 'pending' | 'sent' | 'history'; initialCreating?: boolean; showCreateAction?: boolean; initialId?: string }) {
  const [view, setView] = useState(initialView);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<Shipment> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [creating, setCreating] = useState(initialCreating && user.permissions.includes('shipments.create'));
  const [selected, setSelected] = useState<Shipment | null>(null);
  const [decision, setDecision] = useState<'confirm' | 'refuse' | 'separate' | 'cancel' | null>(null);
  const [auditHistory, setAuditHistory] = useState<ShipmentAuditEvent[]>([]);
  const [auditShipmentId, setAuditShipmentId] = useState('');
  const canCreate = user.permissions.includes('shipments.create');
  const canDecide = user.permissions.includes('shipments.decide');
  const isAdmin = user.roles.includes('ADMIN');
  useEffect(() => {
    if (!selected || !isAdmin) return;
    let active = true;
    void api.get<ShipmentAuditEvent[]>(`/shipments/${selected.id}/audit-history`)
      .then((events) => { if (active) { setAuditHistory(events); setAuditShipmentId(selected.id); } })
      .catch(() => { if (active) { setAuditHistory([]); setAuditShipmentId(selected.id); } });
    return () => { active = false; };
  }, [selected, isAdmin]);
  useEffect(() => {
    if (!initialId) return;
    let active = true;
    void api.get<Shipment>(`/shipments/${initialId}`).then((value) => { if (active) setSelected(value); }).catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : 'Não foi possível abrir o envio.'); });
    return () => { active = false; };
  }, [initialId]);
  const [codeSearch, setCodeSearch] = useState('');
  const [sort, setSort] = useState('RECENT');
  const requestVersion = useRef(0);
  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true); setError('');
    try {
      const result = await api.get<Paginated<Shipment>>(`/shipments?view=${view}&page=${page}&limit=10&codigoMovimentacao=${encodeURIComponent(codeSearch)}&sort=${sort}`);
      if (version === requestVersion.current) setData(result);
    }
    catch (caught) { if (version === requestVersion.current) setError(caught instanceof Error ? caught.message : 'Não foi possível carregar os envios.'); }
    finally { if (version === requestVersion.current) setLoading(false); }
  }, [view, page, codeSearch, sort]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => { requestVersion.current += 1; window.clearTimeout(timer); }; }, [load]);
  // Poll only the list; never replace an open confirmation or an unsent draft.
  useEffect(() => {
    if (selected || creating) return;
    const timer = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(timer);
  }, [load, selected, creating]);
  if (creating) return <NewShipment sector={user.sector as ShipmentSector} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); setSelected(null); setView('sent'); setPage(1); setSuccess('Envio criado. Aguardando confirmação do destinatário.'); void load(); }} />;
  return <>
    {user.sector !== 'REVISAO' && <ShipmentHomeNotice onOpen={() => { setView('pending'); setPage(1); }} />}
    <PageHeader eyebrow={sectorLabel[user.sector as ShipmentSector]} title="Envios entre setores" description="Receba, acompanhe seus envios e consulte as decisões." action={showCreateAction && canCreate && <button onClick={() => setCreating(true)}>{user.sector === 'REVISAO' ? 'Novo envio' : 'Novo envio para Revisão'}</button>} />
    {success && <Notice kind="success" onClose={() => setSuccess('')}>{success}</Notice>}
    <nav className="shipment-tabs" aria-label="Consultas de envios">{([['pending','Aguardando minha ação'],['sent','Enviados por mim'],['history','Histórico']] as const).map(([key,label]) => <button key={key} className={view === key ? '' : 'secondary'} aria-pressed={view === key} onClick={() => { setView(key); setPage(1); setSelected(null); }}>{label}</button>)}</nav>
    <label>Buscar pelo código da movimentação<input type="search" placeholder="ENT-000153" value={codeSearch} onChange={(event) => { setCodeSearch(event.target.value); setPage(1); }} /></label>
    <label>Ordenar por<select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}><option value="RECENT">Mais recentes</option><option value="OLDEST">Mais antigos</option><option value="STATUS">Status</option></select></label>
    {error ? <Notice kind="error">{error} <button className="secondary" onClick={() => void load()}>Tentar novamente</button></Notice> : loading ? <LoadingState label="Consultando envios" /> : !data?.items.length ? <EmptyState title="Nenhum envio nesta consulta" description="Novos recebimentos e decisões aparecerão aqui." /> : <>
      <div className="shipment-list">{data.items.map((shipment) => <article className="surface shipment-card clickable-card" key={shipment.id} tabIndex={0} role="button" onClick={() => { setSelected(shipment); setDecision(null); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(shipment); setDecision(null); } }}>
        <span className={`badge ${shipment.status === 'CONFIRMADO' ? 'active' : ['RECUSADO','CANCELADO'].includes(shipment.status) ? 'canceled' : ''}`}>{shipmentStatusLabel[shipment.status]}</span>
        <p><strong>{shipment.codigoMovimentacao}</strong></p><h2>{sectorLabel[shipment.originSector]} → {sectorLabel[shipment.destinationSector]}</h2>
        <p>{shipment.createdBy.username} · {formatDateTime(shipment.createdAt)}</p><p>{shipment.items.length} item(ns)</p>
        {shipment.originSector === 'REVISAO' && shipment.status === 'AGUARDANDO_RECEBIMENTO' && <p><strong>Quantidade em trânsito, fora do saldo disponível.</strong></p>}
        {shipment.status === 'EM_SEPARACAO' && <p><strong>A Revisão está realizando a separação dos produtos recebidos.</strong></p>}
        {shipment.decidedAt && <p>{shipmentStatusLabel[shipment.status]} por {shipment.decidedBy?.username} em {formatDateTime(shipment.decidedAt)}</p>}
        {shipment.refusalReason && <Notice kind="info">{shipment.status === 'CANCELADO' ? 'Motivo do cancelamento' : 'Motivo da recusa'}: {shipment.refusalReason}</Notice>}
        <button className="secondary button-wide" onClick={(event) => { event.stopPropagation(); setSelected(shipment); setDecision(null); }}>Ver itens e detalhes</button>
      </article>)}</div>
      <div className="shipment-pagination"><button className="secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Anterior</button><span>Página {page} de {data.meta.totalPages} · {data.meta.total} envios</span><button className="secondary" disabled={page >= data.meta.totalPages} onClick={() => setPage((value) => value + 1)}>Próxima</button></div>
    </>}
    {selected && !decision && <Modal labelledBy="shipment-detail-title" className="shipment-detail-dialog" onClose={() => setSelected(null)}>
      <h2 id="shipment-detail-title">{sectorLabel[selected.originSector]} → {sectorLabel[selected.destinationSector]}</h2>
      <p><strong>{shipmentStatusLabel[selected.status]}</strong></p><p>Enviado por {selected.createdBy.username} em {formatDateTime(selected.createdAt)}</p>
      <strong>{selected.codigoMovimentacao}</strong>
      {selected.sourceShipmentId && <button className="text-button" onClick={() => void api.get<Shipment>(`/shipments/${selected.sourceShipmentId}`).then(setSelected).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Erro ao abrir recebimento.'))}>Ver recebimento original</button>}
      {selected.derivedShipments?.map((derived) => <button key={derived.id} className="text-button" onClick={() => void api.get<Shipment>(`/shipments/${derived.id}`).then(setSelected).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Erro ao abrir retorno.'))}>Ver retorno · {shipmentStatusLabel[derived.status]}</button>)}
      {selected.observation && <p><strong>Observação geral:</strong> {selected.observation}</p>}
      <ShipmentItems shipment={selected} />
      {selected.decidedAt && <p>{shipmentStatusLabel[selected.status]} por {selected.decidedBy?.username} em {formatDateTime(selected.decidedAt)}</p>}
      {selected.refusalReason && <Notice kind="info">{selected.status === 'CANCELADO' ? 'Motivo do cancelamento' : 'Motivo da recusa'}: {selected.refusalReason}</Notice>}
      {isAdmin && auditShipmentId === selected.id && auditHistory.length > 0 && <><h3>Auditoria</h3><ul className="pcp-audit-list">{auditHistory.map((event) => <li key={event.id}><strong>{event.action === 'SHIPMENT_CANCEL' ? 'Cancelamento do envio' : event.action}</strong><span>{event.user?.username ?? 'Sistema'} · {formatDateTime(event.createdAt)}</span></li>)}</ul></>}
      {canDecide && selected.status === 'AGUARDANDO_RECEBIMENTO' && selected.destinationSector === user.sector && <div className="dialog-actions"><button className="secondary" onClick={() => setDecision('refuse')}>Recusar envio</button><button onClick={() => setDecision('confirm')}>Confirmar recebimento</button></div>}
      {selected.status === 'AGUARDANDO_RECEBIMENTO' && selected.createdBy.id === user.id && <button className="danger button-wide" onClick={() => setDecision('cancel')}>Cancelar envio</button>}
      {canDecide && selected.status === 'EM_SEPARACAO' && user.sector === 'REVISAO' && <button className="button-wide" onClick={() => setDecision('separate')}>Continuar separação</button>}
      {selected.status === 'EM_SEPARACAO' && user.sector === 'EXPEDICAO' && <Notice kind="info">A Revisão está realizando a separação dos produtos recebidos. Prazo previsto: {selected.separationExpiresAt ? formatDateTime(selected.separationExpiresAt) : 'não informado'}.</Notice>}
      {canCreate && selected.status === 'RECUSADO' && selected.createdBy.id === user.id && <button className="button-wide" onClick={() => { setSelected(null); setCreating(true); }}>Criar novo envio</button>}
      <button className="secondary button-wide" onClick={() => setSelected(null)}>Fechar detalhes</button>
    </Modal>}
    {selected && (decision === 'confirm' || decision === 'refuse') && <ShipmentDecision key={`${selected.id}:${decision}`} shipment={selected} refuse={decision === 'refuse'} onClose={() => setDecision(null)} onDone={() => { setSuccess(decision === 'refuse' ? 'Envio recusado. O remetente poderá consultar o motivo.' : 'Recebimento atualizado com sucesso.'); setDecision(null); setSelected(null); void load(); }} />}
    {selected && decision === 'cancel' && <ShipmentCancellation shipment={selected} onClose={() => setDecision(null)} onDone={() => { setSuccess('Envio cancelado. O registro e o motivo foram preservados no histórico.'); setDecision(null); setSelected(null); void load(); }} />}
    {selected && decision === 'separate' && <SeparationDialog shipment={selected} onClose={() => setDecision(null)} onDone={() => { setSuccess('Separação concluída e saldo líquido consolidado.'); setDecision(null); setSelected(null); void load(); }} />}
  </>;
}

export function ShipmentHomeNotice({ onOpen }: { onOpen: () => void }) {
  const [pending, setPending] = useState<number | null>(null);
  const [sent, setSent] = useState<Shipment[]>([]);
  const [selected, setSelected] = useState<Shipment | null>(null);
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
    {sent.length > 0 && <><h3>Atualizações dos seus envios</h3><ul className="movement-detail-items">{sent.map((shipment) => <li className="clickable-card" tabIndex={0} role="button" onClick={() => setSelected(shipment)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(shipment); } }} key={shipment.id}><strong>{sectorLabel[shipment.destinationSector]} · {shipmentStatusLabel[shipment.status]}</strong><span>{formatDateTime(shipment.decidedAt ?? shipment.createdAt)}</span>{shipment.refusalReason && <span>Motivo: {shipment.refusalReason}</span>}</li>)}</ul></>}
    {selected && <Modal labelledBy="shipment-update-title" className="shipment-detail-dialog" onClose={() => setSelected(null)}><h2 id="shipment-update-title">{sectorLabel[selected.originSector]} → {sectorLabel[selected.destinationSector]}</h2><p><strong>{shipmentStatusLabel[selected.status]}</strong></p><p>Enviado por {selected.createdBy.username} em {formatDateTime(selected.createdAt)}</p>{selected.observation && <p><strong>Observação geral:</strong> {selected.observation}</p>}<ShipmentItems shipment={selected} />{selected.decidedAt && <p>{shipmentStatusLabel[selected.status]} por {selected.decidedBy?.username} em {formatDateTime(selected.decidedAt)}</p>}{selected.refusalReason && <Notice kind="info">Motivo da recusa: {selected.refusalReason}</Notice>}<button className="secondary button-wide" onClick={() => setSelected(null)}>Fechar detalhes</button></Modal>}
  </section>;
}
