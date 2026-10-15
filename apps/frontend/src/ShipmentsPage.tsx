import { useCallback, useEffect, useRef, useState } from 'react';
import { api, Paginated, ShipmentPhotoLimits, UserSession } from './api';
import { EmptyState, LoadingState, Modal, Notice, PageHeader } from './components';
import { formatDate, formatDateTime } from './format';
import { MovementRecordRow } from './MovementRecordRow';
import { NewShipment } from './NewShipment';
import { useMovementSubmission } from './useMovementSubmission';
import { ShipmentSector, sectorLabel, Shipment, ShipmentAuditEvent, shipmentStatusLabel } from './shipments';
import { PhotoAttachment } from './shipment-photo-state';
import { ShipmentPhotoInput } from './ShipmentPhotoInput';
import { auditActionLabel } from './audit-action-labels';
import { ShipmentItems } from './ShipmentItems';
import { ShipmentDetailView } from './ShipmentDetailView';
import { DraftActions } from './FormDrafts';
import { useFormDraft } from './useFormDraft';
import { formatShipmentObservation } from './shipment-observation';

type ShipmentView = 'pending' | 'sent' | 'separation';

function ShipmentDecision({ shipment, refuse, onClose, onDone }: { shipment: Shipment; refuse: boolean; onClose: () => void; onDone: (id: string, separationRequested: boolean) => Promise<void> }) {
  const [reason, setReason] = useState('');
  const [immediateSeparation, setImmediateSeparation] = useState(false);
  const canSeparate = !refuse && shipment.originSector === 'EXPEDICAO' && shipment.destinationSector === 'REVISAO' && shipment.shipmentKind === 'NORMAL';
  const submission = useMovementSubmission(`/shipments/${shipment.id}/${refuse ? 'refusal' : 'confirmation'}`, done, false);
  const draft = useFormDraft(`shipment-decision:${shipment.id}:${refuse}`, refuse ? 'Recusar envio' : 'Receber envio', { reason, immediateSeparation }, (saved) => { setReason(saved.reason); setImmediateSeparation(saved.immediateSeparation); }, { busy: submission.busy });
  const close = () => draft.close(onClose);
  async function done(id: string) { await draft.complete(); await onDone(id, canSeparate && immediateSeparation); }
  if (!draft.ready) return <Modal labelledBy="shipment-decision-title" busy onClose={close}><h2 id="shipment-decision-title">Recuperando rascunho</h2><LoadingState label="Preparando preenchimento" /></Modal>;
  return <Modal labelledBy="shipment-decision-title" busy={submission.busy || !draft.ready} onClose={close}>
    <h2 id="shipment-decision-title">{refuse ? 'Recusar envio' : 'Confirmar recebimento'}</h2>
    <DraftActions draft={draft} />
    {shipment.loadingStatus && <p><strong>Carregamento:</strong> {shipment.loadingStatus === 'CARREGADO' ? `Carregado · placa ${shipment.vehiclePlate}` : 'Não carregado'}</p>}
    {shipment.observation && <p><strong>Observação geral:</strong> {formatShipmentObservation(shipment.observation, shipment)}</p>}
    <ShipmentItems shipment={shipment} />
    <p>{refuse ? shipment.originSector === 'REVISAO' ? 'O saldo em trânsito voltará às posições originais da Revisão.' : 'Nenhum saldo será adicionado à Revisão.' : canSeparate && immediateSeparation ? 'A separação abrirá após confirmar. O saldo da Revisão será consolidado ao concluir ou ao vencer o prazo.' : shipment.destinationSector === 'REVISAO' ? 'Os itens serão adicionados a A Revisar.' : 'A saída será concluída. O saldo reservado não será descontado novamente.'}</p>
    <form onSubmit={(event) => { event.preventDefault(); void submission.submit(refuse ? { reason } : { immediateSeparation }); }}>
      {refuse && <label>Motivo da recusa *<textarea required maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} rows={3} disabled={submission.busy} /></label>}
      {canSeparate && <fieldset className="settings-options"><legend>A separação dos produtos bons será feita agora?</legend><label className="check-row"><input type="radio" name="separation" checked={!immediateSeparation} onChange={() => setImmediateSeparation(false)} />Não, receber todo o volume</label><label className="check-row"><input type="radio" name="separation" checked={immediateSeparation} onChange={() => setImmediateSeparation(true)} />Sim, separar agora</label></fieldset>}
      {submission.conflict && <Notice kind="info">{submission.conflict.message}</Notice>}
      {submission.error && <Notice kind="error">{submission.error}</Notice>}
      <div className="dialog-actions"><button type="button" className="secondary" disabled={submission.busy} onClick={close}>Voltar</button><button disabled={!draft.ready || submission.busy || (refuse && !reason.trim())}>{submission.busy ? 'Processando…' : refuse ? 'Confirmar recusa' : submission.conflict ? 'Aceitar validade diferente e receber' : canSeparate && immediateSeparation ? 'Receber e iniciar separação' : 'Confirmar recebimento'}</button></div>
    </form>
  </Modal>;
}

function ShipmentCancellation({ shipment, onClose, onDone }: { shipment: Shipment; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const submission = useMovementSubmission(`/shipments/${shipment.id}/cancellation`, done, false);
  const draft = useFormDraft(`shipment-cancel:${shipment.id}`, 'Cancelar envio', { reason }, (saved) => setReason(saved.reason), { busy: submission.busy });
  const close = () => draft.close(onClose);
  async function done() { await draft.complete(); onDone(); }
  if (!draft.ready) return <Modal labelledBy="shipment-cancellation-title" busy onClose={close}><h2 id="shipment-cancellation-title">Recuperando rascunho</h2><LoadingState label="Preparando preenchimento" /></Modal>;
  return <Modal labelledBy="shipment-cancellation-title" busy={submission.busy || !draft.ready} onClose={close}>
    <h2 id="shipment-cancellation-title">Cancelar envio {shipment.codigoMovimentacao}?</h2>
    <DraftActions draft={draft} />
    <Notice kind="info">O envio permanecerá no histórico. Se houver saldo reservado pela Revisão, ele será devolvido às posições originais.</Notice>
    <form onSubmit={(event) => { event.preventDefault(); void submission.submit({ reason }); }}>
      <label>Motivo do cancelamento *<textarea required maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} rows={4} disabled={submission.busy} /></label>
      {submission.error && <Notice kind="error">{submission.error}</Notice>}
      <div className="dialog-actions"><button type="button" className="secondary" disabled={submission.busy} onClick={close}>Voltar</button><button className="danger" disabled={!draft.ready || submission.busy || !reason.trim()}>{submission.busy ? 'Cancelando…' : 'Confirmar cancelamento'}</button></div>
    </form>
  </Modal>;
}

function SeparationDialog({ shipment, onClose, onDone }: { shipment: Shipment; onClose: () => void; onDone: () => void }) {
  const [quantities, setQuantities] = useState<Record<string, string>>(() => Object.fromEntries(shipment.items.map((item) => [item.id, String(item.separationDraft?.returnQuantity ?? 0)])));
  const [photos, setPhotos] = useState<Record<string, PhotoAttachment[]>>({});
  const [photoLimits, setPhotoLimits] = useState<ShipmentPhotoLimits | null>(null);
  const photoUrls = useRef(new Set<string>());
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [saved, setSaved] = useState(false);
  const draft = useFormDraft(`separation:${shipment.id}`, 'Separação imediata', { quantities, photos }, (saved) => { setQuantities(saved.quantities); setPhotos(saved.photos); }, { busy });
  const close = () => draft.close(onClose);
  useEffect(() => {
    let active = true;
    const urls = photoUrls.current;
    void api.get<ShipmentPhotoLimits>('/settings/shipment-photos').then((limits) => { if (active) setPhotoLimits(limits); })
      .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : 'Não foi possível carregar os limites de fotos.'); });
    return () => { active = false; urls.forEach((url) => URL.revokeObjectURL(url)); };
  }, []);
  const payload = (includePhotos = false) => ({ items: shipment.items.map((item) => ({ shipmentItemId: item.id, returnQuantity: Number(quantities[item.id] || 0),
    ...(includePhotos && Number(quantities[item.id] || 0) > 0 ? { photoCount: photos[item.id]?.length ?? 0 } : {}) })) });
  const valid = shipment.items.every((item) => Number.isSafeInteger(Number(quantities[item.id])) && Number(quantities[item.id]) >= 0 && Number(quantities[item.id]) <= item.quantity);
  const photoTotal = shipment.items.reduce((sum, item) => sum + (Number(quantities[item.id] || 0) > 0 ? photos[item.id]?.length ?? 0 : 0), 0);
  const photosReady = Boolean(photoLimits) && photoTotal <= 100 && shipment.items.every((item) => Number(quantities[item.id] || 0) === 0 ||
    ((photos[item.id]?.length ?? 0) >= photoLimits!.minimum && (photos[item.id]?.length ?? 0) <= photoLimits!.maximum));
  function addPhotos(itemId: string, files: File[]) {
    const added = files.map((file) => ({ file, url: URL.createObjectURL(file) }));
    added.forEach((photo) => photoUrls.current.add(photo.url));
    setPhotos((current) => ({ ...current, [itemId]: [...(current[itemId] ?? []), ...added] }));
  }
  function removePhoto(itemId: string, index: number) {
    setPhotos((current) => {
      const existing = current[itemId] ?? [];
      const removed = existing[index];
      if (removed) { URL.revokeObjectURL(removed.url); photoUrls.current.delete(removed.url); }
      return { ...current, [itemId]: existing.filter((_, photoIndex) => photoIndex !== index) };
    });
  }
  async function save() { setBusy(true); setError(''); try { await api.patch(`/shipments/${shipment.id}/separation-draft`, payload()); await draft.save(); setSaved(true); onClose(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Não foi possível salvar o rascunho.'); } finally { setBusy(false); } }
  async function complete() { if (!valid || !photosReady) return; setBusy(true); setError(''); try { const orderedFiles = shipment.items.filter((item) => Number(quantities[item.id] || 0) > 0).flatMap((item) => (photos[item.id] ?? []).map((photo) => photo.file)); await api.postMultipart(`/shipments/${shipment.id}/separation-completion`, payload(true), orderedFiles); await draft.complete(); onDone(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Não foi possível concluir a separação.'); } finally { setBusy(false); } }
  if (!draft.ready) return <Modal labelledBy="separation-title" busy onClose={close}><h2 id="separation-title">Recuperando rascunho</h2><LoadingState label="Preparando preenchimento" /></Modal>;
  return <Modal labelledBy="separation-title" className="separation-dialog" busy={busy || !draft.ready} onClose={close}>
    <div className="panel-heading"><div><p className="eyebrow">Recebimento {shipment.codigoMovimentacao}</p><h2 id="separation-title">Finalizar separação</h2></div><button type="button" className="secondary" disabled={busy} onClick={close}>Continuar depois</button></div>
    <p>Informe somente o que retornará à Expedição. O restante entrará diretamente no estoque da Revisão.</p><p className="muted">Para retomar depois, use <strong>Separações para finalizar</strong> no Início ou a aba <strong>Separações em andamento</strong> em Recebimentos. O prazo continua correndo.</p><DraftActions draft={draft} />
    {shipment.separationExpiresAt && <Notice kind="info">Concluir até {formatDateTime(shipment.separationExpiresAt)}.</Notice>}{error && <Notice kind="error">{error}</Notice>}{saved && <Notice kind="success">Rascunho salvo. O prazo continua correndo.</Notice>}
    {!photoLimits && <p className="muted">Carregando os limites de fotos…</p>}
    <div className="separation-items">{shipment.items.map((item) => { const amount = Number(quantities[item.id] || 0); return <article className="shipment-item-card" key={item.id}><div className="shipment-item-heading"><strong>{item.productSnapshot.code} — {item.productSnapshot.name}</strong><b>Recebido: {item.quantity}</b></div><p>Lote {item.batch.code} · {formatDate(item.batch.manufacturingDate)}</p><label>Quantidade de retorno<input type="number" inputMode="numeric" min="0" max={item.quantity} step="1" value={quantities[item.id] ?? '0'} onChange={(event) => { setQuantities((current) => ({ ...current, [item.id]: event.target.value })); setSaved(false); }} /></label>{amount > 0 && photoLimits && <ShipmentPhotoInput photos={photos[item.id] ?? []} limits={photoLimits} productName={item.productSnapshot.name} remainingTotal={100 - photoTotal} onAdd={(files) => addPhotos(item.id, files)} onRemove={(index) => removePhoto(item.id, index)} />}</article>; })}</div>
    <div className="dialog-actions"><button type="button" className="secondary" onClick={() => void save()} disabled={busy || !valid}>Salvar e sair</button><button type="button" onClick={() => void complete()} disabled={busy || !valid || !photosReady}>Concluir separação</button></div>
  </Modal>;
}

export function ShipmentsPage({ user, initialView = 'pending', initialCreating = false, showCreateAction = true, initialId, onHistory }: { user: UserSession; initialView?: ShipmentView; initialCreating?: boolean; showCreateAction?: boolean; initialId?: string; onHistory?: () => void }) {
  const canSeparate = user.sector === 'REVISAO' && user.permissions.includes('shipments.decide');
  const [view, setView] = useState<ShipmentView>(initialView === 'separation' && !canSeparate ? 'pending' : initialView);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<Shipment> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [creating, setCreating] = useState(initialCreating && user.permissions.includes('shipments.create'));
  const [selected, setSelected] = useState<Shipment | null>(null);
  const detailRequestVersion = useRef(0);
  const [decision, setDecision] = useState<'confirm' | 'refuse' | 'separate' | 'cancel' | null>(null);
  const [auditHistory, setAuditHistory] = useState<ShipmentAuditEvent[]>([]);
  const [auditShipmentId, setAuditShipmentId] = useState('');
  const canCreate = user.permissions.includes('shipments.create');
  const canDecide = user.permissions.includes('shipments.decide');
  const isAdmin = user.roles.includes('ADMIN');
  const selectedId = selected?.id;
  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    const version = ++detailRequestVersion.current;
    void api.get<Shipment>(`/shipments/${selectedId}`).then((detail) => {
      if (active && version === detailRequestVersion.current) setSelected((current) => current?.id === selectedId ? detail : current);
    }).catch((caught: unknown) => {
      if (active) setError(caught instanceof Error ? caught.message : 'Não foi possível carregar os detalhes do envio.');
    });
    return () => { active = false; };
  }, [selectedId]);
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
    void api.get<Shipment>(`/shipments/${initialId}`).then((value) => {
      if (active) { setSelected(value); setDecision(canSeparate && value.destinationSector === 'REVISAO' && value.status === 'EM_SEPARACAO' ? 'separate' : null); }
    }).catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : 'Não foi possível abrir o envio.'); });
    return () => { active = false; };
  }, [initialId, canSeparate]);
  const [codeSearch, setCodeSearch] = useState('');
  const [sort, setSort] = useState('RECENT');
  const requestVersion = useRef(0);
  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true); setError('');
    try {
      const status = view === 'separation' ? '&status=EM_SEPARACAO' : view === 'pending' && canSeparate ? '&status=AGUARDANDO_RECEBIMENTO' : '';
      const result = await api.get<Paginated<Shipment>>(`/shipments?view=${view === 'separation' ? 'pending' : view}${status}&page=${page}&limit=10&codigoMovimentacao=${encodeURIComponent(codeSearch)}&sort=${sort}`);
      if (version === requestVersion.current) setData(result);
    }
    catch (caught) { if (version === requestVersion.current) setError(caught instanceof Error ? caught.message : 'Não foi possível carregar os envios.'); }
    finally { if (version === requestVersion.current) setLoading(false); }
  }, [view, page, codeSearch, sort, canSeparate]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => { requestVersion.current += 1; window.clearTimeout(timer); }; }, [load]);
  // Poll only the list; never replace an open confirmation or an unsent draft.
  useEffect(() => {
    if (selected || creating) return;
    const timer = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(timer);
  }, [load, selected, creating]);
  function openShipment(shipment: Shipment, resume = false) {
    setSelected(shipment);
    setDecision(resume && canSeparate && shipment.destinationSector === 'REVISAO' && shipment.status === 'EM_SEPARACAO' ? 'separate' : null);
  }
  function closeSeparation() { setSelected(null); setDecision(null); void load(); }
  async function finishDecision(id: string, separationRequested: boolean) {
    detailRequestVersion.current += 1;
    if (decision === 'refuse') {
      setSuccess('Envio recusado. O remetente poderá consultar o motivo.'); setDecision(null); setSelected(null); void load(); return;
    }
    try {
      const confirmed = await api.get<Shipment>(`/shipments/${id}`);
      if (canSeparate && confirmed.destinationSector === 'REVISAO' && confirmed.status === 'EM_SEPARACAO') {
        setSelected(confirmed); setDecision('separate'); setView('separation'); setPage(1);
        setSuccess('Recebimento confirmado. Finalize a separação ou continue depois.');
        if (view === 'separation' && page === 1) void load();
      } else { setSuccess('Recebimento atualizado com sucesso.'); setDecision(null); setSelected(null); void load(); }
    } catch {
      setDecision(null); setSelected(null);
      setSuccess('Recebimento confirmado.');
      setError('Não foi possível abrir os detalhes atualizados. Use Separações em andamento para retomar ou consulte o Histórico.');
      if (separationRequested && canSeparate) { setView('separation'); setPage(1); }
    }
  }
  const tabs: Array<{ key: ShipmentView; label: string }> = [
    { key: 'pending', label: 'Para receber' },
    ...(canSeparate ? [{ key: 'separation' as const, label: 'Separações em andamento' }] : []),
    { key: 'sent', label: 'Meus envios em aberto' },
  ];
  if (creating) return <NewShipment sector={user.sector as ShipmentSector} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); setSelected(null); setView('sent'); setPage(1); setSuccess('Envio criado. Aguardando confirmação do destinatário.'); void load(); }} />;
  return <>
    {user.sector !== 'REVISAO' && <ShipmentHomeNotice onOpen={() => { setView('pending'); setPage(1); }} />}
    <PageHeader eyebrow={sectorLabel[user.sector as ShipmentSector]} title={view === 'separation' ? 'Separações em andamento' : view === 'pending' && canDecide ? 'Receber produtos' : 'Envios e recebimentos'} description={view === 'separation' ? 'Recebimentos já aceitos que aguardam a definição do retorno. Continue a separação antes do prazo.' : 'Confira o que chegou ou acompanhe seus envios. Os registros concluídos ficam no Histórico.'} action={showCreateAction && canCreate && <button onClick={() => setCreating(true)}>{user.sector === 'REVISAO' ? 'Novo envio' : 'Novo envio para Revisão'}</button>} />
    {success && <Notice kind="success" onClose={() => setSuccess('')}>{success}</Notice>}
    <nav className="shipment-tabs" aria-label="Consultas de envios">{tabs.map(({key,label}) => <button key={key} className={view === key ? '' : 'secondary'} aria-pressed={view === key} onClick={() => { setView(key); setPage(1); setSelected(null); setDecision(null); }}>{label}</button>)}{onHistory && <button className="secondary" onClick={onHistory}>Abrir histórico completo</button>}</nav>
    <label>Buscar pelo código da movimentação<input type="search" placeholder="ENT-000153" value={codeSearch} onChange={(event) => { setCodeSearch(event.target.value); setPage(1); }} /></label>
    <label>Ordenar por<select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}><option value="RECENT">Mais recentes</option><option value="OLDEST">Mais antigos</option><option value="STATUS">Status</option></select></label>
    {error ? <Notice kind="error">{error} <button className="secondary" onClick={() => void load()}>Tentar novamente</button></Notice> : loading ? <LoadingState label="Consultando envios" /> : !data?.items.length ? <EmptyState title={view === 'separation' ? 'Nenhuma separação para finalizar' : 'Nenhum envio nesta consulta'} description={view === 'separation' ? 'Ao receber da Expedição e escolher separar agora, o recebimento ficará disponível aqui.' : 'Novos recebimentos e decisões aparecerão aqui.'} /> : <>
      <div className="shipment-list">{data.items.map((shipment) => <div className="shipment-list-entry" key={shipment.id}>
        <div className="shipment-record-lines">{shipment.items.map((item) => { const needsReceiving = shipment.status === 'AGUARDANDO_RECEBIMENTO' && shipment.destinationSector === user.sector && canDecide; const needsSeparation = shipment.status === 'EM_SEPARACAO' && shipment.destinationSector === 'REVISAO' && canSeparate; return <MovementRecordRow key={item.id}
          code={item.codigoRegistro ?? shipment.codigoMovimentacao} occurredAt={shipment.createdAt}
          status={shipment.status === 'AGUARDANDO_RECEBIMENTO' ? 'Aguardando recebimento' : shipment.status === 'EM_SEPARACAO' ? 'Em separação' : shipmentStatusLabel[shipment.status]}
          statusTone={['RECUSADO', 'CANCELADO'].includes(shipment.status) ? 'canceled' : shipment.status === 'CONFIRMADO' ? 'active' : 'warning'}
          productCode={item.assembly?.packageProductSnapshot.code ?? item.productSnapshot.code} productName={item.assembly?.packageProductSnapshot.name ?? item.productSnapshot.name}
          batchCode={item.assembly?.outputLot ?? item.batch.code} manufacturingDate={item.assembly ? item.assembly.outputManufacturingDate : item.batch.manufacturingDate}
          unit={item.assembly?.packageProductSnapshot.defaultUnit ?? item.productSnapshot.defaultUnit} quantity={item.assembly?.packageQuantity ?? item.quantity}
          origin={sectorLabel[shipment.originSector]} destination={sectorLabel[shipment.destinationSector]}
          sentBy={shipment.createdBy.username} receivedBy={shipment.decidedBy?.username ?? shipment.receivedBy?.username}
          pcpExecutedBy={null} receiptRequired pcpRequired={shipment.shipmentKind !== 'RETORNO_IMEDIATO'}
          onOpen={() => openShipment(shipment)} action={(needsReceiving || needsSeparation) && <button type="button" className="secondary" onClick={() => openShipment(shipment, needsSeparation)}>{needsReceiving ? 'Abrir para receber' : 'Continuar separação'}</button>}
        />; })}</div>
        <article className="surface shipment-card clickable-card" tabIndex={0} role="button" onClick={() => { setSelected(shipment); setDecision(null); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(shipment); setDecision(null); } }}>
        <span className={`badge ${shipment.status === 'CONFIRMADO' ? 'active' : ['RECUSADO','CANCELADO'].includes(shipment.status) ? 'canceled' : ''}`}>{shipmentStatusLabel[shipment.status]}</span>
        <p><strong>{shipment.codigoMovimentacao}</strong></p><h2>{sectorLabel[shipment.originSector]} → {sectorLabel[shipment.destinationSector]}</h2>
        <p>{shipment.createdBy.username} · {formatDateTime(shipment.createdAt)}</p><p>{shipment.items.length} item(ns)</p>
        {shipment.originSector === 'REVISAO' && shipment.status === 'AGUARDANDO_RECEBIMENTO' && <p><strong>Quantidade em trânsito, fora do saldo disponível.</strong></p>}
        {shipment.status === 'EM_SEPARACAO' && <p><strong>A Revisão está realizando a separação dos produtos recebidos.</strong></p>}
        {shipment.decidedAt && <p>{shipmentStatusLabel[shipment.status]} por {shipment.decidedBy?.username} em {formatDateTime(shipment.decidedAt)}</p>}
        {shipment.refusalReason && <Notice kind="info">{shipment.status === 'CANCELADO' ? 'Motivo do cancelamento' : 'Motivo da recusa'}: {shipment.refusalReason}</Notice>}
        <button className="secondary button-wide" onClick={(event) => { event.stopPropagation(); openShipment(shipment, canSeparate && shipment.status === 'EM_SEPARACAO'); }}>{canSeparate && shipment.status === 'EM_SEPARACAO' ? 'Continuar separação' : 'Ver itens e detalhes'}</button>
      </article></div>)}</div>
      <div className="shipment-pagination"><button className="secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Anterior</button><span>Página {page} de {data.meta.totalPages} · {data.meta.total} envios</span><button className="secondary" disabled={page >= data.meta.totalPages} onClick={() => setPage((value) => value + 1)}>Próxima</button></div>
    </>}
    {selected && !decision && <Modal labelledBy="shipment-detail-title" className="shipment-detail-dialog" onClose={() => setSelected(null)}>
      <ShipmentDetailView shipment={selected} titleId="shipment-detail-title" onClose={() => setSelected(null)}
        onOpenShipment={(id) => void api.get<Shipment>(`/shipments/${id}`).then(setSelected).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Erro ao abrir envio vinculado.'))}
        audit={<>
          {selected.status === 'EM_SEPARACAO' && user.sector === 'EXPEDICAO' && <Notice kind="info">A Revisão está realizando a separação dos produtos recebidos. Prazo previsto: {selected.separationExpiresAt ? formatDateTime(selected.separationExpiresAt) : 'não informado'}.</Notice>}
          {isAdmin && auditShipmentId === selected.id && auditHistory.length > 0 && <section className="movement-detail-section" aria-labelledby="shipment-audit-title"><h3 id="shipment-audit-title">Auditoria</h3><ul className="pcp-audit-list">{auditHistory.map((event) => <li key={event.id}><strong title={event.action}>{auditActionLabel(event.action)}</strong><span>{event.user?.username ?? 'Sistema'} · {formatDateTime(event.createdAt)}</span></li>)}</ul></section>}
        </>}
        actions={<>
          {canDecide && selected.status === 'AGUARDANDO_RECEBIMENTO' && selected.destinationSector === user.sector && <><button type="button" className="secondary" onClick={() => setDecision('refuse')}>Recusar envio</button><button type="button" onClick={() => setDecision('confirm')}>Confirmar recebimento</button></>}
          {selected.status === 'AGUARDANDO_RECEBIMENTO' && selected.createdBy.id === user.id && <button type="button" className="danger" onClick={() => setDecision('cancel')}>Cancelar envio</button>}
          {canDecide && selected.status === 'EM_SEPARACAO' && user.sector === 'REVISAO' && <button type="button" onClick={() => setDecision('separate')}>Continuar separação</button>}
          {canCreate && selected.status === 'RECUSADO' && selected.createdBy.id === user.id && <button type="button" onClick={() => { setSelected(null); setCreating(true); }}>Criar novo envio</button>}
        </>} />
    </Modal>}
    {selected && (decision === 'confirm' || decision === 'refuse') && <ShipmentDecision key={`${selected.id}:${decision}`} shipment={selected} refuse={decision === 'refuse'} onClose={() => setDecision(null)} onDone={finishDecision} />}
    {selected && decision === 'cancel' && <ShipmentCancellation shipment={selected} onClose={() => setDecision(null)} onDone={() => { setSuccess('Envio cancelado. O registro e o motivo foram preservados no histórico.'); setDecision(null); setSelected(null); void load(); }} />}
    {selected && decision === 'separate' && <SeparationDialog key={selected.id} shipment={selected} onClose={closeSeparation} onDone={() => { setSuccess('Separação concluída e saldo líquido consolidado.'); setDecision(null); setSelected(null); void load(); }} />}
  </>;
}

export function ShipmentHomeNotice({ onOpen }: { onOpen: () => void }) {
  const [pending, setPending] = useState<number | null>(null);
  const [sent, setSent] = useState<Shipment[]>([]);
  const [selected, setSelected] = useState<Shipment | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<Shipment | null>(null);
  const [detailError, setDetailError] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const load = () => void Promise.all([api.get<Paginated<Shipment>>('/shipments?view=pending&limit=1'), api.get<Paginated<Shipment>>('/shipments?view=updates&limit=3')])
      .then(([p,s]) => { if (active) { setPending(p.meta.total); setSent(s.items); setError(''); } })
      .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : 'Erro ao consultar pendências.'); });
    load(); const timer = window.setInterval(load, 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (!selected) return;
    let active = true;
    void api.get<Shipment>(`/shipments/${selected.id}`).then((detail) => { if (active) setSelectedDetail(detail); })
      .catch((caught: unknown) => { if (active) setDetailError(caught instanceof Error ? caught.message : 'Não foi possível atualizar o detalhe do envio.'); });
    return () => { active = false; };
  }, [selected]);
  return <section className="surface shipment-card"><p className="eyebrow">Envios entre setores</p><h2>Aguardando meu recebimento</h2>
    {error ? <Notice kind="error">{error}</Notice> : pending === null ? <LoadingState label="Consultando pendências" /> : <p><strong>{pending}</strong> envio(s) aguardando sua ação.</p>}
    <button onClick={onOpen}>Abrir envios e recebimentos</button>
    {sent.length > 0 && <><h3>Atualizações dos seus envios</h3><ul className="movement-detail-items">{sent.map((shipment) => <li className="clickable-card" tabIndex={0} role="button" onClick={() => { setSelected(shipment); setSelectedDetail(null); setDetailError(''); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(shipment); setSelectedDetail(null); setDetailError(''); } }} key={shipment.id}><strong>{sectorLabel[shipment.destinationSector]} · {shipmentStatusLabel[shipment.status]}</strong><span>{formatDateTime(shipment.decidedAt ?? shipment.createdAt)}</span>{shipment.refusalReason && <span>Motivo: {shipment.refusalReason}</span>}</li>)}</ul></>}
    {selected && <Modal labelledBy="shipment-update-title" className="shipment-detail-dialog" onClose={() => setSelected(null)}>{detailError && <Notice kind="error">{detailError}</Notice>}<ShipmentDetailView shipment={selectedDetail?.id === selected.id ? selectedDetail : selected} titleId="shipment-update-title" onClose={() => setSelected(null)} /></Modal>}
  </section>;
}
