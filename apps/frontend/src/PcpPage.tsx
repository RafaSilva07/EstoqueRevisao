import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, Paginated, PcpMovementDetail, PcpMovementSummary, StockLocation } from './api';
import { EmptyState, FilterPanel, LoadingState, Modal, Notice, PageHeader } from './components';
import { formatDate, formatDateTime } from './format';
import { ShipmentPhoto } from './ShipmentsPage';
import { canExecutePcp } from './pcp';

const typeLabel: Record<PcpMovementSummary['type'], string> = {
  ENTRADA_EXTERNA: 'Entrada externa', SAIDA_EXTERNA: 'Saída externa',
  TRANSFERENCIA_INTERNA: 'Transferência interna', REVISAO: 'Revisão',
};
const initialFilters = { dateFrom: '', dateTo: '', operationalStatus: 'CONCLUIDA', pcpStatus: 'PENDENTE', type: '', originLocationId: '', destinationLocationId: '', search: '', sort: 'ASC' };
const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'Não foi possível concluir a operação.';

export function PcpPage() {
  const [filters, setFilters] = useState(initialFilters);
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
    <PageHeader eyebrow="PCP" title="Movimentações" description="Consulte movimentações concluídas e registre a execução no sistema corporativo." />
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
        <label>Produto ou lote<input type="search" maxLength={100} value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} placeholder="Código, nome ou lote" /></label>
        <label>Ordenação<select value={filters.sort} onChange={(event) => updateFilter('sort', event.target.value)}><option value="ASC">Mais antigas primeiro</option><option value="DESC">Mais novas primeiro</option></select></label>
      </div>
      <button className="secondary" onClick={() => { setFilters(initialFilters); setPage(1); }}>Limpar filtros</button>
    </FilterPanel>
    {loading ? <LoadingState label="Carregando fila do PCP" /> : !result?.items.length ? <EmptyState title="Nenhuma movimentação encontrada" description="Ajuste os filtros para consultar outras movimentações." /> : <>
      <section className="surface pcp-list"><div className="responsive-table"><table><thead><tr><th>Data</th><th>ID</th><th>Tipo</th><th>Origem</th><th>Destino</th><th>Itens</th><th>Operacional</th><th>PCP</th><th>Ação</th></tr></thead><tbody>{result.items.map((movement) => <tr key={movement.id}><td data-label="Data">{formatDateTime(movement.occurredAt)}</td><td data-label="ID"><code>{movement.id.slice(0, 8)}</code></td><td data-label="Tipo">{typeLabel[movement.type]}</td><td data-label="Origem">{movement.originLocation.name}</td><td data-label="Destino">{movement.destinationLocation?.name ?? 'Múltiplos destinos'}</td><td data-label="Itens">{movement.itemCount}</td><td data-label="Operacional"><span className={`badge ${movement.status === 'EFETIVADA' ? 'active' : 'canceled'}`}>{movement.status === 'EFETIVADA' ? 'Concluída' : 'Cancelada'}</span></td><td data-label="PCP"><span className={`badge ${movement.pcpExecutionStatus === 'EXECUTADA' ? 'active' : 'pending'}`}>{movement.pcpExecutionStatus === 'EXECUTADA' ? 'Executada' : 'Pendente'}</span></td><td data-label="Ação"><button className="secondary" disabled={detailLoading} onClick={() => void open(movement.id)}>Visualizar</button></td></tr>)}</tbody></table></div></section>
      <div className="shipment-pagination"><button className="secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Anterior</button><span>Página {page} de {totalPages} · {result.meta.total} movimentações</span><button className="secondary" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Próxima</button></div>
    </>}
    {selected && <Modal labelledBy="pcp-detail-title" className="pcp-detail-dialog" onClose={() => setSelected(null)}>
      <h2 id="pcp-detail-title">{typeLabel[selected.type]} <small>#{selected.id.slice(0, 8)}</small></h2>
      <dl><dt>Data</dt><dd>{formatDateTime(selected.occurredAt)}</dd><dt>Responsável</dt><dd>{selected.responsibleUser.username}</dd>{selected.shipment && <><dt>Solicitado por</dt><dd>{selected.shipment.createdBy.username} em {formatDateTime(selected.shipment.createdAt)}</dd><dt>Aceito por</dt><dd>{selected.shipment.decidedBy?.username ?? '—'}{selected.shipment.decidedAt ? ` em ${formatDateTime(selected.shipment.decidedAt)}` : ''}</dd></>}<dt>Origem</dt><dd>{selected.originLocation.name}</dd><dt>Destino</dt><dd>{selected.destinationLocation?.name ?? 'Múltiplos destinos'}</dd><dt>Status operacional</dt><dd>{selected.operationalStatus === 'CONCLUIDA' ? 'Concluída' : 'Cancelada'}</dd><dt>Status PCP</dt><dd>{selected.pcpExecutionStatus === 'EXECUTADA' ? 'Executada' : 'Pendente'}</dd><dt>Observação original</dt><dd>{selected.observation || '—'}</dd>{selected.pcpExecutionStatus === 'EXECUTADA' && <><dt>Executada por</dt><dd>{selected.pcpExecutedByUser?.username ?? '—'}</dd><dt>Executada em</dt><dd>{selected.pcpExecutedAt ? formatDateTime(selected.pcpExecutedAt) : '—'}</dd><dt>Observação PCP</dt><dd>{selected.pcpExecutionObservation || '—'}</dd></>}</dl>
      <h3>Itens</h3><ul className="movement-detail-items">{selected.items.map((item) => <li key={item.id}><strong>{(item.productSnapshot ?? item.product).code} — {(item.productSnapshot ?? item.product).name}</strong><span>Lote {item.batch.code} · fabricação {formatDate(item.batch.manufacturingDate)} · validade {formatDate(item.batch.expirationDate)}</span><b>{item.quantity} {(item.productSnapshot ?? item.product).defaultUnit}</b>{item.distributions?.length > 0 && <ul>{item.distributions.map((distribution) => <li key={distribution.id}>{distribution.destinationLocation.name}: {distribution.quantity}</li>)}</ul>}</li>)}</ul>
      {selected.shipmentEvidence.length > 0 && <><h3>Fotos/evidências</h3><div className="pcp-evidence-grid">{selected.shipmentEvidence.map((evidence) => { const item = selected.items.find((candidate) => candidate.productId === evidence.productId && candidate.batchId === evidence.batchId); return <ShipmentPhoto key={evidence.itemId} shipmentId={evidence.shipmentId} itemId={evidence.itemId} productName={(item?.productSnapshot ?? item?.product)?.name ?? 'item'} available={Boolean(evidence.photoMimeType)} />; })}</div></>}
      <h3>Histórico de eventos</h3>{selected.auditHistory.length ? <ul className="pcp-audit-list">{selected.auditHistory.map((event) => <li key={event.id}><strong>{event.action}</strong><span>{event.user?.username ?? 'Sistema'} · {formatDateTime(event.createdAt)}</span></li>)}</ul> : <p className="muted">Nenhum evento de auditoria encontrado.</p>}
      {canExecutePcp(selected) && <button className="button-wide" onClick={() => setConfirming(true)}>Marcar como executada</button>}
    </Modal>}
    {selected && confirming && <Modal labelledBy="pcp-execute-title" busy={executing} onClose={() => setConfirming(false)}><h2 id="pcp-execute-title">Marcar movimentação como executada</h2><p>Confirme somente após lançar ou atualizar esta movimentação no sistema corporativo.</p><form onSubmit={(event) => void execute(event)}><label>Observação da execução (opcional)<textarea name="observation" rows={4} maxLength={1000} disabled={executing} /></label><div className="dialog-actions"><button type="button" className="secondary" disabled={executing} onClick={() => setConfirming(false)}>Cancelar</button><button disabled={executing}>{executing ? 'Confirmando…' : 'Confirmar execução'}</button></div></form></Modal>}
  </>;
}
