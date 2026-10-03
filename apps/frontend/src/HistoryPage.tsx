import { useEffect, useRef, useState } from 'react';
import { api, Movement, Paginated, ReviewDistributionSummary, UserSession } from './api';
import { EmptyState, FilterPanel, LoadingState, Notice, PageHeader } from './components';
import { formatDateTime } from './format';
import { MovementCancellationDialog } from './MovementCancellationDialog';
import { MovementDetailModal } from './MovementDetailModal';
import { ShipmentSummaryModal } from './ShipmentSummaryModal';
import { HistoryRecordRow } from './HistoryRecordRow';
import { ReviewDistributionMatrix } from './MovementRecordRow';
import { buildHistoryQuery } from './history-query';

export interface HistoryItem {
  id: string;
  kind: 'SHIPMENT' | 'MOVEMENT';
  code: string | null;
  type: string;
  origin: string;
  destination: string;
  responsible: string;
  occurredAt: string;
  status: string;
  scope: 'OPEN' | 'PENDING_PCP' | 'DONE' | 'CLOSED';
  itemCount: number;
  direction: 'INCOMING' | 'OUTGOING' | 'INTERNAL';
  parentShipmentId: string | null;
  parentCode: string | null;
  groupId?: string;
  groupCode?: string | null;
  recordId?: string;
  groupItemCount?: number;
  productCode?: string | null;
  productName?: string | null;
  productUnit?: string | null;
  batchCode?: string | null;
  manufacturingDate?: string | null;
  quantity?: number | null;
  pcpExecutionStatus?: string | null;
  sentBy?: string | null;
  receivedBy?: string | null;
  pcpExecutedBy?: string | null;
  pcpRequired?: boolean;
  reviewDistributions?: ReviewDistributionSummary[];
  reviewDistributionUnit?: string | null;
}

const scopeLabel: Record<HistoryItem['scope'], string> = {
  OPEN: 'Em andamento', PENDING_PCP: 'Aguardando PCP', DONE: 'Finalizada', CLOSED: 'Encerrada',
};
const typeLabel: Record<string, string> = {
  ENVIO: 'Envio entre setores', ENTRADA_EXTERNA: 'Entrada externa', SAIDA_EXTERNA: 'Saída externa',
  TRANSFERENCIA_INTERNA: 'Transferência interna', REVISAO: 'Revisão',
};
const initialFilters = { view: 'RECORD', scope: 'ALL', kind: 'ALL', type: 'ALL', direction: 'ALL', dateFrom: '', dateTo: '', search: '', sort: 'RECENT' };
const stateLabel: Record<string, string> = {
  AGUARDANDO_RECEBIMENTO: 'Aguardando recebimento', EM_SEPARACAO: 'Em separação',
  CONFIRMADO: 'Recebimento confirmado', RECUSADO: 'Recusado', CANCELADO: 'Cancelado',
  EFETIVADA: 'Efetivada', CANCELADA: 'Cancelada',
};

export function HistoryPage({ user, initialMovementId, initialRecordId, success, onOpenShipment, onOpenPcp }: {
  user: UserSession; initialMovementId?: string; initialRecordId?: string; success?: string;
  onOpenShipment: (id: string) => void; onOpenPcp: (id: string) => void;
}) {
  const [filters, setFilters] = useState({ ...initialFilters });
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Paginated<HistoryItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exportError, setExportError] = useState('');
  const [exporting, setExporting] = useState(false);
  const exportInProgress = useRef(false);
  const [selectedMovementId, setSelectedMovementId] = useState<string | null>(initialMovementId ?? null);
  const [selectedShipmentId, setSelectedShipmentId] = useState<string | null>(null);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(initialRecordId && initialRecordId !== initialMovementId ? initialRecordId : null);
  const [cancelTarget, setCancelTarget] = useState<Movement | null>(null);
  const [cancelSuccess, setCancelSuccess] = useState('');
  const pcp = user.sector === 'PCP';
  const canCancel = user.permissions.includes('movements.cancel');

  useEffect(() => {
    if (searchInput === filters.search) return;
    const timer = window.setTimeout(() => {
      setFilters((current) => ({ ...current, search: searchInput }));
      setPage(1);
      setLoading(true);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput, filters.search]);

  useEffect(() => {
    let active = true;
    const params = buildHistoryQuery(filters, page);
    void api.get<Paginated<HistoryItem>>(`/history?${params}`).then((data) => {
      if (active) { setResult(data); setError(''); }
    }).catch((caught: unknown) => {
      if (active) setError(caught instanceof Error ? caught.message : 'Não foi possível consultar o histórico.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filters, page, cancelSuccess]);

  const update = (key: keyof typeof filters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value })); setPage(1); setLoading(true); setExportError('');
  };
  const clear = () => { setSearchInput(''); setFilters({ ...initialFilters }); setPage(1); setLoading(true); setExportError(''); };
  const activeFilters = Object.entries(filters).filter(([key, value]) => value && value !== 'ALL'
    && !(key === 'sort' && value === 'RECENT') && !(key === 'view' && value === 'RECORD')).length;
  const exportScopeAllowed = filters.scope === 'ALL' || filters.scope === 'DONE';

  async function exportHistory() {
    if (exportInProgress.current || !exportScopeAllowed) return;
    exportInProgress.current = true; setExporting(true); setExportError('');
    try {
      const params = buildHistoryQuery({ ...filters, view: 'RECORD', scope: 'DONE' });
      const blob = await api.getBlob(`/history/export.csv?${params}`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = 'historico-finalizadas.csv';
      document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (caught: unknown) {
      setExportError(caught instanceof Error ? caught.message : 'Não foi possível exportar o histórico.');
    } finally { exportInProgress.current = false; setExporting(false); }
  }

  return <>
    <PageHeader eyebrow="Consulta" title="Histórico de movimentações" description="Envios e operações de estoque em uma única lista. Use o status para encontrar o que ainda precisa de ação." />
    {success && <Notice kind="success">{success}</Notice>}
    {cancelSuccess && <Notice kind="success">{cancelSuccess}</Notice>}
    {error && <Notice kind="error">{error}</Notice>}
    {exportError && <Notice kind="error">{exportError}</Notice>}
    <FilterPanel count={activeFilters}><div className="filter-grid">
      <label>Visualização<select value={filters.view} onChange={(event) => update('view', event.target.value)}><option value="RECORD">Por registro</option><option value="GROUP">Por grupo</option></select></label>
      <label>Status<select value={filters.scope} onChange={(event) => update('scope', event.target.value)}><option value="ALL">Todos</option><option value="OPEN">Em andamento</option><option value="PENDING_PCP">Aguardando PCP</option><option value="DONE">Finalizadas</option><option value="CLOSED">Encerradas sem conclusão</option></select></label>
      <label>Origem do registro<select value={filters.kind} onChange={(event) => update('kind', event.target.value)}><option value="ALL">Envios e operações</option>{!pcp && <option value="SHIPMENT">Envios entre setores</option>}<option value="MOVEMENT">Operações de estoque</option></select></label>
      <label>Tipo<select value={filters.type} onChange={(event) => update('type', event.target.value)}><option value="ALL">Todos</option>{!pcp && <option value="ENVIO">Envio entre setores</option>}<option value="ENTRADA_EXTERNA">Entrada externa</option><option value="SAIDA_EXTERNA">Saída externa</option><option value="TRANSFERENCIA_INTERNA">Transferência interna</option><option value="REVISAO">Revisão</option></select></label>
      {!pcp && <label>Sentido<select value={filters.direction} onChange={(event) => update('direction', event.target.value)}><option value="ALL">Entradas, saídas e internos</option><option value="INCOMING">Entradas para meu setor</option><option value="OUTGOING">Saídas do meu setor</option>{user.sector === 'REVISAO' && <option value="INTERNAL">Movimentos internos</option>}</select></label>}
      <label>De<input type="date" value={filters.dateFrom} onChange={(event) => update('dateFrom', event.target.value)} /></label>
      <label>Até<input type="date" value={filters.dateTo} onChange={(event) => update('dateTo', event.target.value)} /></label>
      <label>Buscar código ou produto<input type="search" maxLength={100} placeholder="ENT-000153, código ou nome" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /></label>
      <label>Ordenar<select value={filters.sort} onChange={(event) => update('sort', event.target.value)}><option value="RECENT">Mais recentes</option><option value="OLDEST">Mais antigas</option></select></label>
    </div>{activeFilters > 0 && <button className="text-button" onClick={clear}>Limpar filtros</button>}</FilterPanel>
    <div className="surface history-export">
      <div><strong>Exportar finalizadas</strong><p>Uma linha por registro, em colunas. Usa os filtros acima e todas as páginas, sem pendências de recebimento, separação ou PCP.</p>
        {!exportScopeAllowed && <small>Selecione o status Todos ou Finalizadas para exportar.</small>}</div>
      <button type="button" className="secondary" disabled={exporting || loading || !exportScopeAllowed || searchInput !== filters.search || Boolean(error)} onClick={() => void exportHistory()}>
        {exporting ? 'Preparando CSV…' : 'Exportar CSV'}
      </button>
    </div>
    {loading ? <LoadingState label="Carregando histórico" /> : !result?.items.length ? <EmptyState title="Nenhum registro encontrado" description="Ajuste ou limpe os filtros para ver outras movimentações." action={activeFilters ? <button className="secondary" onClick={clear}>Limpar filtros</button> : undefined} /> : <>
      <div className={`history-list ${filters.view === 'RECORD' ? 'record-list' : ''}`}>{result.items.map((item) => { const openItem = () => { setSelectedRecordId(item.recordId ?? null); if (item.kind === 'SHIPMENT') setSelectedShipmentId(item.groupId ?? item.id); else setSelectedMovementId(item.groupId ?? item.id); }; return <div className="record-list-entry" key={`${item.kind}:${item.id}`}>
      {item.recordId && <HistoryRecordRow item={item} onOpen={openItem} />}
      <button type="button" className={`surface history-card ${item.recordId ? 'record-mobile-card' : ''}`} onClick={openItem}>
        <span className={`badge ${item.scope === 'DONE' ? 'active' : item.scope === 'CLOSED' ? 'canceled' : 'pending'}`}>{scopeLabel[item.scope]}</span>
        <strong>{item.code ?? 'Sem código público'} · {item.recordId ? item.productName ?? 'Produto' : typeLabel[item.type] ?? item.type}</strong>
        {item.recordId && <span>{item.productCode} · lote {item.batchCode} · {item.quantity} {item.productUnit} · Grupo {item.groupCode ?? 'sem código público'}</span>}
        <span>{item.origin} → {item.destination}</span>
        {item.type === 'REVISAO' && <ReviewDistributionMatrix distributions={item.reviewDistributions} unit={item.reviewDistributionUnit} />}
        {item.parentCode && <span>Parte do envio original {item.parentCode}</span>}
        <small>{stateLabel[item.status] ?? item.status} · {formatDateTime(item.occurredAt)} · {item.responsible}{!item.recordId && ` · ${item.itemCount} ${item.itemCount === 1 ? 'registro' : 'registros'}`}</small>
        <span className="history-card-action">Ver detalhes →</span>
      </button></div>; })}</div>
      <div className="shipment-pagination"><button className="secondary" disabled={page <= 1} onClick={() => { setPage((current) => current - 1); setLoading(true); }}>Anterior</button><span>Página {page} de {result.meta.totalPages} · {result.meta.total} registros</span><button className="secondary" disabled={page >= result.meta.totalPages} onClick={() => { setPage((current) => current + 1); setLoading(true); }}>Próxima</button></div>
    </>}
    {selectedShipmentId && <ShipmentSummaryModal id={selectedShipmentId} user={user} recordId={selectedRecordId} onSelectRecord={setSelectedRecordId} onViewGroup={() => setSelectedRecordId(null)} onClose={() => { setSelectedShipmentId(null); setSelectedRecordId(null); }} onOpen={(id) => { setSelectedShipmentId(null); onOpenShipment(id); }} onOpenMovement={user.sector === 'REVISAO' && user.permissions.includes('movements.read') ? (id) => { setSelectedShipmentId(null); setSelectedMovementId(id); setSelectedRecordId(null); } : undefined} />}
    {selectedMovementId && <MovementDetailModal movementId={selectedMovementId} recordId={selectedRecordId} onSelectRecord={setSelectedRecordId} onViewGroup={() => setSelectedRecordId(null)} pcp={pcp} onClose={() => { setSelectedMovementId(null); setSelectedRecordId(null); }}>{(movement) => <>
      {movement.shipmentId && !pcp && <button className="secondary button-wide" onClick={() => { setSelectedMovementId(null); setSelectedShipmentId(movement.shipmentId!); }}>Ver envio original</button>}
      {canCancel && !movement.shipmentId && movement.status === 'EFETIVADA' && <button className="danger button-wide" onClick={() => setCancelTarget(movement)}>Cancelar movimentação</button>}
      {pcp && user.permissions.includes('pcp.movements.execute') && movement.status === 'EFETIVADA' && movement.requiresPcpExecution && (selectedRecordId ? movement.items.find((item) => item.id === selectedRecordId)?.pcpExecutionStatus === 'PENDENTE' : movement.pcpExecutionStatus === 'PENDENTE') && <button className="button-wide" onClick={() => { setSelectedMovementId(null); onOpenPcp(selectedRecordId ?? movement.id); }}>Executar no PCP</button>}
    </>}</MovementDetailModal>}
    {cancelTarget && <MovementCancellationDialog movement={cancelTarget} onClose={() => setCancelTarget(null)} onCanceled={() => { setCancelTarget(null); setSelectedMovementId(null); setCancelSuccess('Movimentação cancelada e estoque estornado.'); }} />}
  </>;
}
