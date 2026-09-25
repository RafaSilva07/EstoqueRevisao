import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, Paginated, PcpMovementDetail, PcpMovementSummary, StockLocation } from './api';
import { EmptyState, FilterPanel, LoadingState, Modal, Notice, PageHeader } from './components';
import { formatDate, formatDateTime } from './format';
import { ShipmentPhoto } from './ShipmentsPage';
import { canExecutePcp } from './pcp';
import { MovementEvidence } from './MovementEvidence';

const typeLabel: Record<PcpMovementSummary['type'], string> = {
  ENTRADA_EXTERNA: 'Entrada externa', SAIDA_EXTERNA: 'Saída externa',
  TRANSFERENCIA_INTERNA: 'Transferência interna', REVISAO: 'Revisão',
};
const initialFilters = { dateFrom: '', dateTo: '', operationalStatus: 'CONCLUIDA', pcpStatus: 'PENDENTE', type: '', originLocationId: '', destinationLocationId: '', search: '', sort: 'ASC' };
const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'Não foi possível concluir a operação.';

export function PcpPage({ initialStatus = 'PENDENTE', initialId }: { initialStatus?: '' | 'PENDENTE' | 'EXECUTADA'; initialId?: string }) {
  const [filters, setFilters] = useState<typeof initialFilters>({ ...initialFilters, pcpStatus: initialStatus, operationalStatus: initialStatus === '' ? '' : initialFilters.operationalStatus });
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Paginated<PcpMovementSummary> | null>(null);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [selected, setSelected] = useState<PcpMovementDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [executing, setExecuting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    Object.entries(filters).forEach(([key, value]) => {
      if (!value) return;
      const normalized = key === 'dateFrom' ? new Date(`${value}T00:00:00.000`).toISOString()
        : key === 'dateTo' ? new Date(`${value}T23:59:59.999`).toISOString() : value;
      params.set(key, normalized);
    });
    try { setResult(await api.get(`/pcp/movements?${params}`)); }
    catch (caught) { setError(messageFrom(caught)); }
    finally { setLoading(false); }
  }, [filters, page]);

  useEffect(() => { void api.get<Paginated<StockLocation>>('/stocks?limit=100').then((data) => setLocations(data.items)).catch(() => undefined); }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 200); return () => window.clearTimeout(timer); }, [load]);

  useEffect(() => {
    if (!initialId) return;
    let active = true;
    void api.get<PcpMovementDetail>(`/pcp/movements/${initialId}`).then((value) => { if (active) setSelected(value); }).catch((caught: unknown) => { if (active) setError(messageFrom(caught)); });
    return () => { active = false; };
  }, [initialId]);

  async function open(id: string) {
    setDetailLoading(true); setError('');
    try { setSelected(await api.get(`/pcp/movements/${id}`)); }
    catch (caught) { setError(messageFrom(caught)); }
    finally { setDetailLoading(false); }
  }

  async function execute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected || executing) return;
    setExecuting(true); setError('');
    const form = new FormData(event.currentTarget);
    const observationValue = form.get('observation');
    try {
      const updated = await api.post<PcpMovementDetail>(`/pcp/movements/${selected.id}/execution`, { observation: typeof observationValue === 'string' ? observationValue.trim() || undefined : undefined });
      setSelected(updated); setConfirming(false); setSuccess('Movimentação marcada como executada pelo PCP.'); await load();
    } catch (caught) { setError(messageFrom(caught)); }
    finally { setExecuting(false); }
  }

  const updateFilter = (key: keyof typeof filters, value: string) => { setFilters((current) => ({ ...current, [key]: value })); setPage(1); };
  const totalPages = result?.meta.totalPages ?? 1;
  return <>
    <PageHeader eyebrow="PCP" title="Movimentações" description="A movimentação permanece efetivada no estoque; o status PCP muda de Pendente para Executada após o lançamento no sistema corporativo." />
    {success && <Notice kind="success" onClose={() => setSuccess('')}>{success}</Notice>}
    {error && <Notice kind="error" onClose={() => setError('')}>{error}</Notice>}
    <FilterPanel count={Object.entries(filters).filter(([key, value]) => value && !(key === 'operationalStatus' && value === 'CONCLUIDA') && !(key === 'pcpStatus' && value === 'PENDENTE') && !(key === 'sort' && value === 'ASC')).length}>
      <div className="filter-grid pcp-filters">
        <label>Data inicial<input type="date" value={filters.dateFrom} onChange={(event) => updateFilter('dateFrom', event.target.value)} /></label>
        <label>Data final<input type="date" value={filters.dateTo} onChange={(event) => updateFilter('dateTo', event.target.value)} /></label>
        <label>Status operacional<select value={filters.operationalStatus} onChange={(event) => updateFilter('operationalStatus', event.target.value)}><option value="">Todos</option><option value="CONCLUIDA">Concluída</option><option value="CANCELADA">Cancelada</option></select></label>
        <label>Status PCP<select value={filters.pcpStatus} onChange={(event) => updateFilter('pcpStatus', event.target.value)}><option value="">Todos</option><option value="PENDENTE">Pendente</option><option value="EXECUTADA">Executada</option></select></label>
        <label>Tipo<select value={filters.type} onChange={(event) => updateFilter('type', event.target.value)}><option value="">Todos</option>{Object.entries(typeLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Origem<select value={filters.originLocationId} onChange={(event) => updateFilter('originLocationId', event.target.value)}><option value="">Todas</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
        <label>Destino<select value={filters.destinationLocationId} onChange={(event) => updateFilter('destinationLocationId', event.target.value)}><option value="">Todos</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
        <label>Código da movimentação, produto ou lote<input type="search" maxLength={100} value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} placeholder="ENT-000153, produto ou lote" /></label>
        <label>Ordenação<select value={filters.sort} onChange={(event) => updateFilter('sort', event.target.value)}><option value="ASC">Mais antigas primeiro</option><option value="DESC">Mais novas primeiro</option><option value="PCP_STATUS">Status PCP</option></select></label>
      </div>
      <button className="secondary" onClick={() => { setFilters(initialFilters); setPage(1); }}>Limpar filtros</button>
    </FilterPanel>
    {loading ? <LoadingState label="Carregando fila do PCP" /> : !result?.items.length ? <EmptyState title="Nenhuma movimentação encontrada" description="Ajuste os filtros para consultar outras movimentações." /> : <>
      <section className="surface pcp-list"><div className="responsive-table"><table><thead><tr><th>Data</th><th>Código</th><th>Tipo</th><th>Origem</th><th>Destino</th><th>Itens</th><th>Operacional</th><th>PCP</th><th>Ação</th></tr></thead><tbody>{result.items.map((movement) => <tr key={movement.id} className="clickable-row" tabIndex={0} role="button" onClick={() => void open(movement.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void open(movement.id); } }}><td data-label="Data">{formatDateTime(movement.occurredAt)}</td><td data-label="Código"><code>{movement.codigoMovimentacao ?? 'Sem código público'}</code></td><td data-label="Tipo">{typeLabel[movement.type]}</td><td data-label="Origem">{movement.originLocation.name}</td><td data-label="Destino">{movement.destinationLocation?.name ?? 'Múltiplos destinos'}</td><td data-label="Itens">{movement.itemCount}</td><td data-label="Operacional"><span className={`badge ${movement.status === 'EFETIVADA' ? 'active' : 'canceled'}`}>{movement.status === 'EFETIVADA' ? 'Concluída' : 'Cancelada'}</span></td><td data-label="PCP"><span className={`badge ${movement.pcpExecutionStatus === 'EXECUTADA' ? 'active' : 'pending'}`}>{movement.requiresPcpExecution === false ? 'Não necessária' : movement.pcpExecutionStatus === 'EXECUTADA' ? 'Executada' : 'Pendente'}</span></td><td data-label="Ação"><button className="secondary" disabled={detailLoading} onClick={(event) => { event.stopPropagation(); void open(movement.id); }}>Visualizar</button></td></tr>)}</tbody></table></div></section>
      <div className="shipment-pagination"><button className="secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Anterior</button><span>Página {page} de {totalPages} · {result.meta.total} movimentações</span><button className="secondary" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Próxima</button></div>
    </>}
    {selected && <Modal labelledBy="pcp-detail-title" className="pcp-detail-dialog" onClose={() => setSelected(null)}>
      <h2 id="pcp-detail-title">{typeLabel[selected.type]} <small>{selected.codigoMovimentacao ?? 'Sem código público'}</small></h2>
      <dl><dt>Data</dt><dd>{formatDateTime(selected.occurredAt)}</dd><dt>Responsável</dt><dd>{selected.responsibleUser.username}</dd>{selected.shipment && <><dt>Solicitado por</dt><dd>{selected.shipment.createdBy.username} em {formatDateTime(selected.shipment.createdAt)}</dd><dt>Aceito por</dt><dd>{selected.shipment.decidedBy?.username ?? '—'}{selected.shipment.decidedAt ? ` em ${formatDateTime(selected.shipment.decidedAt)}` : ''}</dd></>}<dt>Origem</dt><dd>{selected.originLocation.name}</dd><dt>Destino</dt><dd>{selected.destinationLocation?.name ?? 'Múltiplos destinos'}</dd><dt>Status operacional</dt><dd>{selected.operationalStatus === 'CONCLUIDA' ? 'Concluída' : 'Cancelada'}</dd><dt>Status PCP</dt><dd>{selected.requiresPcpExecution === false ? 'Não necessária' : selected.pcpExecutionStatus === 'EXECUTADA' ? 'Executada' : 'Pendente'}</dd><dt>Observação original</dt><dd>{selected.observation || '—'}</dd>{selected.pcpExecutionStatus === 'EXECUTADA' && <><dt>Executada por</dt><dd>{selected.pcpExecutedByUser?.username ?? '—'}</dd><dt>Executada em</dt><dd>{selected.pcpExecutedAt ? formatDateTime(selected.pcpExecutedAt) : '—'}</dd><dt>Observação PCP</dt><dd>{selected.pcpExecutionObservation || '—'}</dd></>}</dl>
      <h3>Itens</h3><ul className="movement-detail-items">{selected.items.map((item) => { const evidence = selected.shipmentEvidence.filter((photo) => photo.productId === item.productId && photo.batchId === item.batchId && (photo.photoMimeType || photo.additionalPhotos?.length)); return <li key={item.id}><strong>{(item.productSnapshot ?? item.product).code} — {(item.productSnapshot ?? item.product).name}</strong><span>Lote {item.batch.code} · fabricação {formatDate(item.batch.manufacturingDate)} · validade {formatDate(item.batch.expirationDate)}</span><b>{item.quantity} {(item.productSnapshot ?? item.product).defaultUnit}</b>{item.distributions?.length > 0 && <ul>{item.distributions.map((distribution) => <li key={distribution.id}>{distribution.destinationLocation.name}: {distribution.quantity}</li>)}</ul>}{evidence.length > 0 && <MovementEvidence key={`${selected.pcpExecutionStatus}:${item.id}`} pendingPcp={canExecutePcp(selected)}><div className="pcp-evidence-grid">{evidence.map((photo) => <ShipmentPhoto key={photo.itemId} shipmentId={photo.shipmentId} itemId={photo.itemId} productName={(item.productSnapshot ?? item.product).name} available={Boolean(photo.photoMimeType)} additionalPhotos={photo.additionalPhotos} />)}</div></MovementEvidence>}</li>; })}</ul>
      <h3>Histórico de eventos</h3>{selected.auditHistory.length ? <ul className="pcp-audit-list">{selected.auditHistory.map((event) => <li key={event.id}><strong>{event.action}</strong><span>{event.user?.username ?? 'Sistema'} · {formatDateTime(event.createdAt)}</span></li>)}</ul> : <p className="muted">Nenhum evento de auditoria encontrado.</p>}
      {canExecutePcp(selected) && <button className="button-wide" onClick={() => setConfirming(true)}>Marcar como executada</button>}
    </Modal>}
    {selected && confirming && <Modal labelledBy="pcp-execute-title" busy={executing} onClose={() => setConfirming(false)}><h2 id="pcp-execute-title">Marcar movimentação como executada</h2><p>Confirme somente após lançar ou atualizar esta movimentação no sistema corporativo.</p><form onSubmit={(event) => void execute(event)}><label>Observação da execução (opcional)<textarea name="observation" rows={4} maxLength={1000} disabled={executing} /></label><div className="dialog-actions"><button type="button" className="secondary" disabled={executing} onClick={() => setConfirming(false)}>Cancelar</button><button disabled={executing}>{executing ? 'Confirmando…' : 'Confirmar execução'}</button></div></form></Modal>}
  </>;
}
