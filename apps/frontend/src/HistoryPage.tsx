import { useEffect, useState } from 'react';
import { api, Movement, Paginated, UserSession } from './api';
import { EmptyState, FilterPanel, LoadingState, Notice, PageHeader } from './components';
import { formatDateTime } from './format';
import { MovementCancellationDialog } from './MovementCancellationDialog';
import { MovementDetailModal } from './MovementDetailModal';
import { ShipmentSummaryModal } from './ShipmentSummaryModal';

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
}

const scopeLabel: Record<HistoryItem['scope'], string> = {
  OPEN: 'Em andamento', PENDING_PCP: 'Aguardando PCP', DONE: 'Finalizada', CLOSED: 'Encerrada',
};
const typeLabel: Record<string, string> = {
  ENVIO: 'Envio entre setores', ENTRADA_EXTERNA: 'Entrada externa', SAIDA_EXTERNA: 'Saída externa',
  TRANSFERENCIA_INTERNA: 'Transferência interna', REVISAO: 'Revisão',
};
const initialFilters = { scope: 'ALL', kind: 'ALL', type: 'ALL', direction: 'ALL', dateFrom: '', dateTo: '', search: '', sort: 'RECENT' };
const stateLabel: Record<string, string> = {
  AGUARDANDO_RECEBIMENTO: 'Aguardando recebimento', EM_SEPARACAO: 'Em separação',
  CONFIRMADO: 'Recebimento confirmado', RECUSADO: 'Recusado', CANCELADO: 'Cancelado',
  EFETIVADA: 'Efetivada', CANCELADA: 'Cancelada',
};

export function HistoryPage({ user, initialMovementId, success, onOpenShipment, onOpenPcp }: {
  user: UserSession; initialMovementId?: string; success?: string;
  onOpenShipment: (id: string) => void; onOpenPcp: (id: string) => void;
}) {
  const [filters, setFilters] = useState({ ...initialFilters });
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Paginated<HistoryItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedMovementId, setSelectedMovementId] = useState<string | null>(initialMovementId ?? null);
  const [selectedShipmentId, setSelectedShipmentId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Movement | null>(null);
  const [cancelSuccess, setCancelSuccess] = useState('');
  const pcp = user.sector === 'PCP';
  const canCancel = user.roles.includes('ADMIN') && user.permissions.includes('movements.cancel');

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ ...filters, page: String(page), limit: '20' });
    if (filters.dateFrom) params.set('dateFrom', new Date(`${filters.dateFrom}T00:00:00.000`).toISOString());
    else params.delete('dateFrom');
    if (filters.dateTo) params.set('dateTo', new Date(`${filters.dateTo}T23:59:59.999`).toISOString());
    else params.delete('dateTo');
    void api.get<Paginated<HistoryItem>>(`/history?${params}`).then((data) => {
      if (active) { setResult(data); setError(''); }
    }).catch((caught: unknown) => {
      if (active) setError(caught instanceof Error ? caught.message : 'Não foi possível consultar o histórico.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filters, page, cancelSuccess]);

  const update = (key: keyof typeof filters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value })); setPage(1); setLoading(true);
  };
  const clear = () => { setFilters({ ...initialFilters }); setPage(1); setLoading(true); };
  const activeFilters = Object.entries(filters).filter(([key, value]) => value && value !== 'ALL' && !(key === 'sort' && value === 'RECENT')).length;

  return <>
    <PageHeader eyebrow="Consulta" title="Histórico de movimentações" description="Envios e operações de estoque em uma única lista. Use o status para encontrar o que ainda precisa de ação." />
    {success && <Notice kind="success">{success}</Notice>}
    {cancelSuccess && <Notice kind="success">{cancelSuccess}</Notice>}
    {error && <Notice kind="error">{error}</Notice>}
    <FilterPanel count={activeFilters}><div className="filter-grid">
      <label>Status<select value={filters.scope} onChange={(event) => update('scope', event.target.value)}><option value="ALL">Todos</option><option value="OPEN">Em andamento</option><option value="PENDING_PCP">Aguardando PCP</option><option value="DONE">Finalizadas</option><option value="CLOSED">Encerradas sem conclusão</option></select></label>
      <label>Origem do registro<select value={filters.kind} onChange={(event) => update('kind', event.target.value)}><option value="ALL">Envios e operações</option>{!pcp && <option value="SHIPMENT">Envios entre setores</option>}<option value="MOVEMENT">Operações de estoque</option></select></label>
      <label>Tipo<select value={filters.type} onChange={(event) => update('type', event.target.value)}><option value="ALL">Todos</option>{!pcp && <option value="ENVIO">Envio entre setores</option>}<option value="ENTRADA_EXTERNA">Entrada externa</option><option value="SAIDA_EXTERNA">Saída externa</option><option value="TRANSFERENCIA_INTERNA">Transferência interna</option><option value="REVISAO">Revisão</option></select></label>
      {!pcp && <label>Sentido<select value={filters.direction} onChange={(event) => update('direction', event.target.value)}><option value="ALL">Entradas, saídas e internos</option><option value="INCOMING">Entradas para meu setor</option><option value="OUTGOING">Saídas do meu setor</option>{user.sector === 'REVISAO' && <option value="INTERNAL">Movimentos internos</option>}</select></label>}
      <label>De<input type="date" value={filters.dateFrom} onChange={(event) => update('dateFrom', event.target.value)} /></label>
      <label>Até<input type="date" value={filters.dateTo} onChange={(event) => update('dateTo', event.target.value)} /></label>
      <label>Buscar código ou produto<input type="search" maxLength={100} placeholder="ENT-000153, código ou nome" value={filters.search} onChange={(event) => update('search', event.target.value)} /></label>
      <label>Ordenar<select value={filters.sort} onChange={(event) => update('sort', event.target.value)}><option value="RECENT">Mais recentes</option><option value="OLDEST">Mais antigas</option></select></label>
    </div>{activeFilters > 0 && <button className="text-button" onClick={clear}>Limpar filtros</button>}</FilterPanel>
    {loading ? <LoadingState label="Carregando histórico" /> : !result?.items.length ? <EmptyState title="Nenhum registro encontrado" description="Ajuste ou limpe os filtros para ver outras movimentações." action={activeFilters ? <button className="secondary" onClick={clear}>Limpar filtros</button> : undefined} /> : <>
      <div className="history-list">{result.items.map((item) => <button type="button" className="surface history-card" key={`${item.kind}:${item.id}`} onClick={() => item.kind === 'SHIPMENT' ? setSelectedShipmentId(item.id) : setSelectedMovementId(item.id)}>
        <span className={`badge ${item.scope === 'DONE' ? 'active' : item.scope === 'CLOSED' ? 'canceled' : 'pending'}`}>{scopeLabel[item.scope]}</span>
        <strong>{item.code ?? 'Sem código público'} · {typeLabel[item.type] ?? item.type}</strong>
        <span>{item.origin} → {item.destination}</span>
        {item.parentCode && <span>Parte do envio original {item.parentCode}</span>}
        <small>{stateLabel[item.status] ?? item.status} · {formatDateTime(item.occurredAt)} · {item.responsible} · {item.itemCount} {item.itemCount === 1 ? 'item' : 'itens'}</small>
        <span className="history-card-action">Ver detalhes →</span>
      </button>)}</div>
      <div className="shipment-pagination"><button className="secondary" disabled={page <= 1} onClick={() => { setPage((current) => current - 1); setLoading(true); }}>Anterior</button><span>Página {page} de {result.meta.totalPages} · {result.meta.total} registros</span><button className="secondary" disabled={page >= result.meta.totalPages} onClick={() => { setPage((current) => current + 1); setLoading(true); }}>Próxima</button></div>
    </>}
    {selectedShipmentId && <ShipmentSummaryModal id={selectedShipmentId} user={user} onClose={() => setSelectedShipmentId(null)} onOpen={(id) => { setSelectedShipmentId(null); onOpenShipment(id); }} onOpenMovement={user.sector === 'REVISAO' && user.permissions.includes('movements.read') ? (id) => { setSelectedShipmentId(null); setSelectedMovementId(id); } : undefined} />}
    {selectedMovementId && <MovementDetailModal movementId={selectedMovementId} pcp={pcp} onClose={() => setSelectedMovementId(null)}>{(movement) => <>
      {movement.shipmentId && !pcp && <button className="secondary button-wide" onClick={() => { setSelectedMovementId(null); setSelectedShipmentId(movement.shipmentId!); }}>Ver envio original</button>}
      {canCancel && !movement.shipmentId && movement.status === 'EFETIVADA' && <button className="danger button-wide" onClick={() => setCancelTarget(movement)}>Cancelar movimentação</button>}
      {pcp && movement.status === 'EFETIVADA' && movement.requiresPcpExecution && movement.pcpExecutionStatus === 'PENDENTE' && <button className="button-wide" onClick={() => { setSelectedMovementId(null); onOpenPcp(movement.id); }}>Executar no PCP</button>}
    </>}</MovementDetailModal>}
    {cancelTarget && <MovementCancellationDialog movement={cancelTarget} onClose={() => setCancelTarget(null)} onCanceled={() => { setCancelTarget(null); setSelectedMovementId(null); setCancelSuccess('Movimentação cancelada e estoque estornado.'); }} />}
  </>;
}
