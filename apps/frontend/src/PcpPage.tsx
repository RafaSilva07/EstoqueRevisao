import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, Paginated, PcpMovementDetail, PcpMovementSummary, StockLocation } from './api';
import { EmptyState, FilterPanel, LoadingState, Modal, Notice, PageHeader } from './components';
import { formatDateTime } from './format';
import { canExecutePcp } from './pcp';
import { MovementDetailModal } from './MovementDetailModal';
import { auditActionLabel } from './audit-action-labels';
import { MovementRecordRow, ReviewDistributionMatrix } from './MovementRecordRow';
import { DraftActions } from './FormDrafts';
import { useFormDraft } from './useFormDraft';

const typeLabel: Record<PcpMovementSummary['type'], string> = {
  ENTRADA_EXTERNA: 'Entrada externa', SAIDA_EXTERNA: 'Saída externa',
  TRANSFERENCIA_INTERNA: 'Transferência interna', REVISAO: 'Revisão',
};
const initialFilters = { view: 'RECORD', dateFrom: '', dateTo: '', operationalStatus: 'CONCLUIDA', pcpStatus: 'PENDENTE', type: '', originLocationId: '', destinationLocationId: '', search: '', sort: 'ASC' };
const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'Não foi possível concluir a operação.';

export function PcpPage({ initialStatus = 'PENDENTE', initialId, canExecute = false }: { initialStatus?: '' | 'PENDENTE' | 'EXECUTADA'; initialId?: string; canExecute?: boolean }) {
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
  const [executionObservation, setExecutionObservation] = useState('');
  const draft = useFormDraft(`pcp-execute:${selected?.recordId ?? selected?.id ?? ''}`, 'Executar no PCP', { executionObservation }, (saved) => setExecutionObservation(saved.executionObservation), { enabled: confirming && Boolean(selected), busy: executing });
  const closeExecution = () => draft.close(() => setConfirming(false));

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
    void api.get<PcpMovementDetail>(`/pcp/movements/records/${initialId}`)
      .catch(() => api.get<PcpMovementDetail>(`/pcp/movements/${initialId}`))
      .then((value) => { if (active) setSelected(value); }).catch((caught: unknown) => { if (active) setError(messageFrom(caught)); });
    return () => { active = false; };
  }, [initialId]);

  async function open(id: string, record = false) {
    setDetailLoading(true); setError('');
    try { setSelected(await api.get(`/pcp/movements/${record ? `records/${id}` : id}`)); }
    catch (caught) { setError(messageFrom(caught)); }
    finally { setDetailLoading(false); }
  }

  async function execute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected || executing || !canExecute) return;
    setExecuting(true); setError('');
    try {
      const updated = await api.post<PcpMovementDetail>(`/pcp/movements/${selected.recordId ? `records/${selected.recordId}` : selected.id}/execution`, { observation: executionObservation.trim() || undefined });
      await draft.complete(); setExecutionObservation('');
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
    <FilterPanel count={Object.entries(filters).filter(([key, value]) => value && !(key === 'operationalStatus' && value === 'CONCLUIDA') && !(key === 'pcpStatus' && value === 'PENDENTE') && !(key === 'sort' && value === 'ASC') && !(key === 'view' && value === 'RECORD')).length}>
      <div className="filter-grid pcp-filters">
        <label>Visualização<select value={filters.view} onChange={(event) => updateFilter('view', event.target.value)}><option value="RECORD">Por registro</option><option value="GROUP">Por grupo</option></select></label>
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
      {filters.view === 'RECORD' && <div className="pcp-record-lines">{result.items.map((movement) => { const product = movement.assembly?.packageProductSnapshot ?? movement.productSnapshot ?? movement.product; const pending = movement.status === 'EFETIVADA' && movement.requiresPcpExecution && movement.pcpExecutionStatus === 'PENDENTE'; const openRecord = () => void open(movement.recordId ?? movement.id, Boolean(movement.recordId)); return <MovementRecordRow key={movement.recordId ?? movement.id}
        code={movement.codigoRegistro ?? movement.codigoMovimentacao} occurredAt={movement.occurredAt}
        status={movement.status === 'CANCELADA' ? 'Cancelada' : pending ? 'Aguardando PCP' : 'Finalizada'}
        statusTone={movement.status === 'CANCELADA' ? 'canceled' : pending ? 'pending' : 'active'}
        productCode={product?.code} productName={product?.name} batchCode={movement.assembly?.outputLot ?? movement.batch?.code}
        manufacturingDate={movement.assembly ? movement.assembly.outputManufacturingDate : movement.batch?.manufacturingDate} unit={product?.defaultUnit} quantity={movement.assembly?.packageQuantity ?? movement.quantity}
        origin={movement.assembly ? [...new Set(movement.assembly.sources.map((source) => source.locationName))].join(', ') : movement.originLocation.name} destination={movement.destinationLocation?.name ?? 'Múltiplos destinos'}
        sentBy={movement.sentBy ?? movement.responsibleUser.username} receivedBy={movement.receivedBy}
        pcpExecutedBy={movement.pcpExecutedBy ?? movement.pcpExecutedByUser?.username}
        receiptRequired={Boolean(movement.shipmentId)} pcpRequired={movement.requiresPcpExecution}
        reviewDistributions={movement.type === 'REVISAO' ? movement.reviewDistributions : undefined}
        reviewDistributionUnit={movement.reviewDistributionUnit}
        onOpen={openRecord} action={canExecute && pending && <button type="button" className="secondary" disabled={detailLoading} onClick={openRecord}>Executar no PCP</button>}
      />; })}</div>}
      <section className={`surface pcp-list ${filters.view === 'RECORD' ? 'pcp-table-mobile' : ''}`}><div className="responsive-table"><table><thead><tr><th>Data</th><th>Código</th><th>Produto / lote</th><th>Tipo</th><th>Origem</th><th>Destino</th><th>Operacional</th><th>PCP</th><th>Ação</th></tr></thead><tbody>{result.items.map((movement) => <tr key={movement.recordId ?? movement.id} className="clickable-row" tabIndex={0} role="button" onClick={() => void open(movement.recordId ?? movement.id, Boolean(movement.recordId))} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void open(movement.recordId ?? movement.id, Boolean(movement.recordId)); } }}>
        <td data-label="Data">{formatDateTime(movement.occurredAt)}</td>
        <td data-label="Código"><code>{movement.codigoRegistro ?? movement.codigoMovimentacao ?? 'Sem código público'}</code>{movement.recordId && <small>Grupo {movement.codigoGrupo ?? 'sem código público'}</small>}</td>
        <td data-label="Produto / lote">{movement.recordId ? <><span className="pcp-record-product-name">{(movement.assembly?.packageProductSnapshot ?? movement.productSnapshot ?? movement.product)?.name}</span><span className="pcp-record-product-meta">Lote {movement.assembly?.outputLot ?? movement.batch?.code} · {movement.assembly?.packageQuantity ?? movement.quantity} {(movement.assembly?.packageProductSnapshot ?? movement.productSnapshot ?? movement.product)?.defaultUnit}</span>{movement.type === 'REVISAO' && <ReviewDistributionMatrix distributions={movement.reviewDistributions} unit={movement.reviewDistributionUnit} />}</> : `${movement.itemCount} registros`}</td>
        <td data-label="Tipo">{typeLabel[movement.type]}</td><td data-label="Origem">{movement.originLocation.name}</td><td data-label="Destino">{movement.destinationLocation?.name ?? 'Múltiplos destinos'}</td>
        <td data-label="Operacional"><span className={`badge ${movement.status === 'EFETIVADA' ? 'active' : 'canceled'}`}>{movement.status === 'EFETIVADA' ? 'Concluída' : 'Cancelada'}</span></td>
        <td data-label="PCP"><span className={`badge ${movement.pcpExecutionStatus === 'EXECUTADA' ? 'active' : 'pending'}`}>{movement.requiresPcpExecution === false ? 'Não necessária' : movement.pcpExecutionStatus === 'EXECUTADA' ? 'Executada' : 'Pendente'}</span>{!movement.recordId && movement.requiresPcpExecution && movement.executedCount !== undefined && <small>{movement.executedCount} executado(s) de {movement.itemCount}</small>}</td>
        <td data-label="Ação"><button className="secondary" disabled={detailLoading} onClick={(event) => { event.stopPropagation(); void open(movement.recordId ?? movement.id, Boolean(movement.recordId)); }}>Visualizar</button></td>
      </tr>)}</tbody></table></div></section>
      <div className="shipment-pagination"><button className="secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Anterior</button><span>Página {page} de {totalPages} · {result.meta.total} {filters.view === 'RECORD' ? 'registros' : 'grupos'}</span><button className="secondary" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Próxima</button></div>
    </>}
    {selected && <MovementDetailModal movementId={selected.id} initialMovement={selected} recordId={selected.recordId} pcp
      onClose={() => setSelected(null)} onViewGroup={() => void open(selected.id)} onSelectRecord={(id) => void open(id, true)}
      audit={<section className="movement-detail-section" aria-labelledby="pcp-audit-title">
        <h3 id="pcp-audit-title">Histórico de eventos</h3>
        {selected.auditHistory.length ? <ul className="pcp-audit-list">{selected.auditHistory.map((event) => <li key={event.id}><strong title={event.action}>{auditActionLabel(event.action)}</strong><span>{event.user?.username ?? 'Sistema'} · {formatDateTime(event.createdAt)}</span></li>)}</ul> : <p className="muted">Nenhum evento de auditoria encontrado.</p>}
      </section>}
    >{canExecute && selected.recordId && canExecutePcp(selected) ? () => <button type="button" className="button-wide" onClick={() => { setExecutionObservation(''); setConfirming(true); }}>Marcar registro como executado</button> : undefined}</MovementDetailModal>}
    {selected && confirming && <Modal labelledBy="pcp-execute-title" busy={executing || !draft.ready} onClose={closeExecution}><h2 id="pcp-execute-title">Marcar movimentação como executada</h2><p>Confirme somente após lançar ou atualizar esta movimentação no sistema corporativo.</p><DraftActions draft={draft} /><form onSubmit={(event) => void execute(event)}><label>Observação da execução (opcional)<textarea name="observation" value={executionObservation} onChange={(event) => setExecutionObservation(event.target.value)} rows={4} maxLength={1000} disabled={executing || !draft.ready} /></label><div className="dialog-actions"><button type="button" className="secondary" disabled={executing} onClick={closeExecution}>Cancelar</button><button disabled={executing || !draft.ready}>{executing ? 'Confirmando…' : 'Confirmar execução'}</button></div></form></Modal>}
  </>;
}
