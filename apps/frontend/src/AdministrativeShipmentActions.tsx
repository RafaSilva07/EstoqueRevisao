import { FormEvent, useRef, useState } from 'react';
import { api, ApiError } from './api';
import { LoadingState, Modal, Notice } from './components';
import { DraftActions } from './FormDrafts';
import { formatDate } from './format';
import { useOperationalActions } from './operational-actions';
import { Shipment, sectorLabel } from './shipments';
import { useFormDraft } from './useFormDraft';

export function AdministrativeShipmentActions({ shipmentId, shipment, onDone }: { shipmentId: string; shipment?: Shipment; onDone: () => void }) {
  const actions = useOperationalActions();
  const admin = actions.adminRoles.some((role) => ['ADMIN', 'ADMIN_REVISAO_EXPEDICAO', 'ADMIN_PRODUCAO_PCP'].includes(role));
  const [mode, setMode] = useState<'edit' | 'cancel' | null>(null);
  const [data, setData] = useState<Shipment | null>(null);
  const [error, setError] = useState('');
  if (!admin) return null;
  const permitted = !shipment || actions.adminRoles.includes('ADMIN') || actions.adminRoles.includes('ADMIN_REVISAO_EXPEDICAO')
    || (actions.adminRoles.includes('ADMIN_PRODUCAO_PCP') && [shipment.originSector, shipment.destinationSector].includes('PRODUCAO'));
  if (!permitted || (shipment && !['AGUARDANDO_RECEBIMENTO', 'EM_SEPARACAO', 'CONFIRMADO'].includes(shipment.status))) return null;
  const executed = shipment?.movements?.some((movement) => movement.pcpExecutionStatus === 'EXECUTADA' || movement.items?.some((item) => item.pcpExecutionStatus === 'EXECUTADA'));
  async function open(next: 'edit' | 'cancel') {
    setMode(next); setData(null); setError('');
    try { setData(await api.get<Shipment>(`/shipments/${shipmentId}`)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Não foi possível consultar a solicitação.'); }
  }
  return <section className="movement-detail-section"><h3>Administração da solicitação</h3>
    {executed ? <p className="muted">Alterações bloqueadas: há registro executado no PCP.</p> : <div className="dialog-actions">
      {!shipment?.sourceShipmentId && <button type="button" className="secondary" onClick={() => void open('edit')}>Editar solicitação</button>}
      <button type="button" className="secondary" onClick={() => void open('cancel')}>Cancelar solicitação</button>
    </div>}
    {mode && !data && <Modal labelledBy="admin-shipment-loading" onClose={() => setMode(null)}><h2 id="admin-shipment-loading">Consultar solicitação</h2>{error ? <Notice kind="error">{error}</Notice> : <LoadingState label="Consultando situação atual" />}<button type="button" className="secondary" onClick={() => setMode(null)}>Voltar</button></Modal>}
    {mode && data && <AdministrativeShipmentForm key={`${shipmentId}:${mode}`} shipment={data} mode={mode} onClose={() => setMode(null)} onDone={() => { setMode(null); onDone(); actions.changed?.(); }} />}
  </section>;
}

function AdministrativeShipmentForm({ shipment, mode, onClose, onDone }: { shipment: Shipment; mode: 'edit' | 'cancel'; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [observation, setObservation] = useState(shipment.observation ?? '');
  const [loadingStatus, setLoadingStatus] = useState(shipment.loadingStatus ?? 'NAO_CARREGADO');
  const [vehiclePlate, setVehiclePlate] = useState(shipment.vehiclePlate ?? '');
  const [items, setItems] = useState(shipment.items.map((item) => ({ shipmentItemId: item.id, quantity: String(item.assembly?.packageQuantity ?? item.quantity), observation: item.observation ?? '' })));
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [expirationKeys, setExpirationKeys] = useState<string[]>([]);
  const [error, setError] = useState('');
  const draft = useFormDraft(`shipment-admin:${shipment.id}:${mode}`, mode === 'edit' ? 'Correção de solicitação' : 'Cancelamento administrativo', { reason, observation, loadingStatus, vehiclePlate, items, requestKey }, (saved) => {
    setReason(saved.reason); setObservation(saved.observation); setLoadingStatus(saved.loadingStatus); setVehiclePlate(saved.vehiclePlate); setItems(saved.items); setRequestKey(saved.requestKey);
  }, { busy });
  const locked = shipment.movements?.some((movement) => movement.pcpExecutionStatus === 'EXECUTADA' || movement.items?.some((item) => item.pcpExecutionStatus === 'EXECUTADA'));
  const eligible = ['AGUARDANDO_RECEBIMENTO', 'EM_SEPARACAO', 'CONFIRMADO'].includes(shipment.status) && !locked && !(mode === 'edit' && shipment.sourceShipmentId);
  const valid = reason.trim().length > 0 && (mode === 'cancel' || (items.length > 0 && items.every((item) => Number.isSafeInteger(Number(item.quantity)) && Number(item.quantity) > 0)));
  function preview(event: FormEvent) { event.preventDefault(); if (valid) { setExpirationKeys([]); setConfirming(true); } }
  async function submit() {
    if (inFlight.current || !eligible || !valid) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      await api.post(`/shipments/${shipment.id}/${mode === 'edit' ? 'correction' : 'admin-cancellation'}`, mode === 'edit' ? {
        requestKey, reason: reason.trim(), observation: observation.trim() || undefined, confirmedExpirationKeys: expirationKeys,
        ...(shipment.originSector === 'EXPEDICAO' ? { loadingStatus, vehiclePlate: loadingStatus === 'CARREGADO' ? vehiclePlate.trim() : undefined } : {}),
        items: items.map((item) => ({ ...item, quantity: Number(item.quantity), observation: item.observation.trim() || undefined })),
      } : { reason: reason.trim() });
      await draft.complete(); onDone();
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'LOT_EXPIRATION_CONFIRMATION_REQUIRED') setExpirationKeys(caught.details?.expirationKeys ?? []);
      setError(caught instanceof Error ? caught.message : 'Não foi possível concluir a alteração.');
    }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <Modal labelledBy="admin-shipment-title" busy={busy || !draft.ready} onClose={() => draft.close(onClose)} className="shipment-detail-dialog">
    <div className="panel-heading"><div><p className="eyebrow">Correção auditável · {shipment.codigoMovimentacao}</p><h2 id="admin-shipment-title">{mode === 'edit' ? 'Editar solicitação' : 'Cancelar solicitação'}</h2></div><button type="button" className="secondary" disabled={busy} onClick={() => draft.close(onClose)}>Fechar</button></div>
    <p>{sectorLabel[shipment.originSector]} → {sectorLabel[shipment.destinationSector]}</p>
    {!eligible ? <Notice kind="error">Esta solicitação não pode ser alterada. Registros executados no PCP são protegidos; retornos devem ser corrigidos pelo recebimento original.</Notice> : <>
      <DraftActions draft={draft} />{error && <Notice kind="error">{error}</Notice>}
      {!confirming ? <form onSubmit={preview}>
        {mode === 'edit' && <><p className="muted">A original será cancelada e uma nova solicitação vinculada aguardará recebimento. Produtos, lotes, posições e fotos são preservados. Para alterar esses dados, cancele e crie um novo envio.</p>
          <ul className="movement-detail-items movement-product-list">{items.map((input) => { const item = shipment.items.find((item) => item.id === input.shipmentItemId)!; const product = item.assembly?.packageProductSnapshot ?? item.productSnapshot; return <li key={item.id}><strong>{product.code} — {product.name}</strong><span>Lote {item.batch.code} · {formatDate(item.batch.manufacturingDate)}</span>
            <label>Quantidade ({product.defaultUnit})<input type="number" min="1" step="1" required disabled={Boolean(item.assembly)} value={input.quantity} onChange={(event) => setItems((current) => current.map((entry) => entry.shipmentItemId === item.id ? { ...entry, quantity: event.target.value } : entry))} /></label>
            {item.assembly && <small>Para mudar a quantidade montada ou as parcelas, cancele e crie uma nova montagem.</small>}
            <label>Observação do produto<textarea maxLength={1000} value={input.observation} onChange={(event) => setItems((current) => current.map((entry) => entry.shipmentItemId === item.id ? { ...entry, observation: event.target.value } : entry))} /></label>
            <button type="button" className="text-button" disabled={items.length === 1} onClick={() => setItems((current) => current.filter((entry) => entry.shipmentItemId !== item.id))}>Remover da nova solicitação</button></li>; })}</ul>
          {shipment.originSector === 'EXPEDICAO' && <div className="form-grid"><label>Carregamento<select value={loadingStatus} onChange={(event) => setLoadingStatus(event.target.value as typeof loadingStatus)}><option value="NAO_CARREGADO">Não carregado</option><option value="CARREGADO">Carregado</option></select></label>{loadingStatus === 'CARREGADO' && <label>Placa do veículo<input required maxLength={20} value={vehiclePlate} onChange={(event) => setVehiclePlate(event.target.value)} /></label>}</div>}
          <label>Observação do envio<textarea maxLength={1000} value={observation} onChange={(event) => setObservation(event.target.value)} /></label></>}
        <label>Motivo obrigatório<textarea required maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
        <div className="dialog-actions"><button type="button" className="secondary" onClick={() => draft.close(onClose)}>Voltar</button><button disabled={!draft.ready || !valid}>Conferir impacto</button></div>
      </form> : <><h3>Confira o impacto</h3><p>O cancelamento atinge a solicitação inteira e seus retornos vinculados, preservando todos os registros no histórico. Entradas efetivadas serão retiradas de Revisar; reservas/saídas serão devolvidas às posições exatas de origem.</p>
        {mode === 'edit' && <p>Será criada uma nova solicitação com {items.length} produto(s), nas quantidades conferidas, para novo aceite. Nenhuma quantidade alterada será creditada automaticamente.</p>}
        <p><strong>Motivo:</strong> {reason}</p><Notice kind="info">Se faltar saldo para o estorno ou existir execução no PCP, nada será alterado.</Notice>
        <div className="dialog-actions"><button type="button" className="secondary" disabled={busy} onClick={() => setConfirming(false)}>Voltar e conferir</button><button type="button" disabled={busy} onClick={() => void submit()}>{busy ? 'Confirmando…' : mode === 'edit' ? 'Confirmar correção' : 'Confirmar cancelamento'}</button></div></>}
    </>}
  </Modal>;
}
