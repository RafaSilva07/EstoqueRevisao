import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  api,
  MovementReportItem,
  MovementReportTotals,
  ReportResult,
  ReviewReportItem,
  ReviewReportTotals,
  StockReportItem,
  StockReportTotals,
} from './api';
import { EmptyState, LoadingState, Notice, PageHeader } from './components';
import { formatDate, formatDateTime } from './format';

type ReportTab = 'movements' | 'reviews' | 'stock';
type Filters = Record<string, string>;

const movementInitial: Filters = {
  dateFrom: '', dateTo: '', type: '', product: '', batch: '', origin: '', destination: '',
  responsible: '', status: '',
};
const reviewInitial: Filters = { dateFrom: '', dateTo: '', product: '', batch: '', destination: '' };

function localDate(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const stockInitial: Filters = {
  product: '', batch: '', location: '', expirationFrom: '', expirationTo: '',
  expirationStatus: '', referenceDate: localDate(), expiringWithinDays: '30',
};

const movementLabels: Record<MovementReportItem['type'], string> = {
  ENTRADA_EXTERNA: 'Entrada externa',
  SAIDA_EXTERNA: 'Saida externa',
  TRANSFERENCIA_INTERNA: 'Transferencia interna',
  REVISAO: 'Revisao',
};

function quantityLabel(values: Array<{ unit: string; quantity: number }>): string {
  if (values.length === 0) return '0';
  return values.map((value) => `${value.quantity.toLocaleString('pt-BR')} ${value.unit}`).join(' | ');
}

function expirationLabel(status: StockReportItem['expirationStatus']): string {
  return ({
    VENCIDO: 'Vencido',
    PROXIMO_VENCIMENTO: 'Proximo do vencimento',
    VALIDO: 'Valido',
  })[status];
}

function queryString(filters: Filters, page?: number): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (!value) return;
    if (key === 'dateFrom' || key === 'dateTo') {
      const time = key === 'dateFrom' ? '00:00:00.000' : '23:59:59.999';
      params.set(key, new Date(`${value}T${time}`).toISOString());
    } else {
      params.set(key, value);
    }
  });
  if (page !== undefined) {
    params.set('page', String(page));
    params.set('limit', '20');
  }
  return params.toString();
}

function initialFor(tab: ReportTab): Filters {
  if (tab === 'movements') return movementInitial;
  if (tab === 'reviews') return reviewInitial;
  return stockInitial;
}

export function ReportsPage({ canMovements, canStock }: { canMovements: boolean; canStock: boolean }) {
  const firstTab: ReportTab = canMovements ? 'movements' : 'stock';
  const [tab, setTab] = useState<ReportTab>(firstTab);
  const [draft, setDraft] = useState<Filters>({ ...initialFor(firstTab) });
  const [applied, setApplied] = useState<Filters>({ ...initialFor(firstTab) });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [movementReport, setMovementReport] = useState<ReportResult<MovementReportItem, MovementReportTotals> | null>(null);
  const [reviewReport, setReviewReport] = useState<ReportResult<ReviewReportItem, ReviewReportTotals> | null>(null);
  const [stockReport, setStockReport] = useState<ReportResult<StockReportItem, StockReportTotals> | null>(null);

  const activeFilters = useMemo(() => Object.entries(applied).filter(([key, value]) => (
    Boolean(value) && key !== 'referenceDate' && key !== 'expiringWithinDays'
  )).length, [applied]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = queryString(applied, page);
      if (tab === 'movements') {
        setMovementReport(await api.get<ReportResult<MovementReportItem, MovementReportTotals>>(`/reports/movements?${params}`));
      } else if (tab === 'reviews') {
        setReviewReport(await api.get<ReportResult<ReviewReportItem, ReviewReportTotals>>(`/reports/reviews?${params}`));
      } else {
        setStockReport(await api.get<ReportResult<StockReportItem, StockReportTotals>>(`/reports/stock?${params}`));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Nao foi possivel carregar o relatorio.');
    } finally {
      setLoading(false);
    }
  }, [applied, page, tab]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  function selectTab(next: ReportTab): void {
    setTab(next);
    const initial = { ...initialFor(next) };
    setDraft(initial);
    setApplied(initial);
    setPage(1);
    setError('');
  }

  function applyFilters(event: FormEvent): void {
    event.preventDefault();
    setApplied({ ...draft });
    setPage(1);
  }

  function clearFilters(): void {
    const initial = { ...initialFor(tab) };
    setDraft(initial);
    setApplied(initial);
    setPage(1);
  }

  async function exportCsv(): Promise<void> {
    setExporting(true);
    setError('');
    try {
      const names = {
        movements: ['movements', 'relatorio-movimentacoes.csv'],
        reviews: ['reviews', 'relatorio-revisoes.csv'],
        stock: ['stock', 'relatorio-estoque-atual.csv'],
      } as const;
      const [route, filename] = names[tab];
      await api.downloadCsv(`/reports/${route}.csv?${queryString(applied)}`, filename);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Nao foi possivel exportar o relatorio.');
    } finally {
      setExporting(false);
    }
  }

  const meta = tab === 'movements' ? movementReport?.meta : tab === 'reviews' ? reviewReport?.meta : stockReport?.meta;

  return <>
    <PageHeader eyebrow="Consultas" title="Relatorios" description="Consulte dados historicos e a posicao atual sem alterar o estoque." />
    {error && <Notice kind="error" onClose={() => setError('')}>{error}</Notice>}
    <div className="report-tabs" role="tablist" aria-label="Tipos de relatorio">
      {canMovements && <button className={tab === 'movements' ? 'current' : 'secondary'} onClick={() => selectTab('movements')}>Movimentacoes</button>}
      {canMovements && <button className={tab === 'reviews' ? 'current' : 'secondary'} onClick={() => selectTab('reviews')}>Revisao</button>}
      {canStock && <button className={tab === 'stock' ? 'current' : 'secondary'} onClick={() => selectTab('stock')}>Estoque atual</button>}
    </div>
    <section className="surface filters-panel filters-open report-filters">
      <div className="panel-heading"><div><p className="eyebrow">Filtros</p><h2>{activeFilters} filtro(s) ativo(s)</h2></div><button type="button" className="secondary" onClick={clearFilters}>Limpar filtros</button></div>
      <form className="filter-grid" onSubmit={applyFilters}>
        {tab !== 'stock' && <><label>De<input type="date" value={draft.dateFrom} onChange={(event) => setDraft({ ...draft, dateFrom: event.target.value })} /></label><label>Ate<input type="date" value={draft.dateTo} onChange={(event) => setDraft({ ...draft, dateTo: event.target.value })} /></label></>}
        {tab === 'movements' && <label>Tipo<select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })}><option value="">Todos</option><option value="ENTRADA_EXTERNA">Entrada externa</option><option value="SAIDA_EXTERNA">Saida externa</option><option value="TRANSFERENCIA_INTERNA">Transferencia interna</option><option value="REVISAO">Revisao</option></select></label>}
        <label>Produto<input value={draft.product} onChange={(event) => setDraft({ ...draft, product: event.target.value })} maxLength={200} placeholder="Codigo ou nome" /></label>
        <label>Lote<input value={draft.batch} onChange={(event) => setDraft({ ...draft, batch: event.target.value.toUpperCase() })} maxLength={6} placeholder="Codigo do lote" /></label>
        {tab === 'movements' && <><label>Origem<input value={draft.origin} onChange={(event) => setDraft({ ...draft, origin: event.target.value })} maxLength={150} /></label><label>Destino<input value={draft.destination} onChange={(event) => setDraft({ ...draft, destination: event.target.value })} maxLength={150} /></label><label>Responsavel<input value={draft.responsible} onChange={(event) => setDraft({ ...draft, responsible: event.target.value })} maxLength={100} /></label><label>Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option value="">Todos</option><option value="EFETIVADA">Efetivada</option><option value="CANCELADA">Cancelada</option></select></label></>}
        {tab === 'reviews' && <label>Classificacao<input value={draft.destination} onChange={(event) => setDraft({ ...draft, destination: event.target.value })} maxLength={150} placeholder="Lata Boa, Varejo ou TUF" /></label>}
        {tab === 'stock' && <><label>Local/classificacao<input value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} maxLength={150} /></label><label>Validade de<input type="date" value={draft.expirationFrom} onChange={(event) => setDraft({ ...draft, expirationFrom: event.target.value })} /></label><label>Validade ate<input type="date" value={draft.expirationTo} onChange={(event) => setDraft({ ...draft, expirationTo: event.target.value })} /></label><label>Situacao<select value={draft.expirationStatus} onChange={(event) => setDraft({ ...draft, expirationStatus: event.target.value })}><option value="">Todas</option><option value="VENCIDO">Vencido</option><option value="PROXIMO_VENCIMENTO">Proximo do vencimento</option><option value="VALIDO">Valido</option></select></label><label>Janela de proximidade<input type="number" min="1" max="365" value={draft.expiringWithinDays} onChange={(event) => setDraft({ ...draft, expiringWithinDays: event.target.value })} /><small>Dias a partir de {formatDate(draft.referenceDate)}</small></label></>}
        <div className="form-actions report-filter-actions"><button>Aplicar filtros</button><button type="button" className="secondary" disabled={exporting} onClick={() => void exportCsv()}>{exporting ? 'Exportando...' : 'Exportar CSV'}</button></div>
      </form>
    </section>
    {loading ? <LoadingState label="Carregando relatorio" /> : <>
      {tab === 'movements' && movementReport && <MovementResults report={movementReport} />}
      {tab === 'reviews' && reviewReport && <ReviewResults report={reviewReport} />}
      {tab === 'stock' && stockReport && <StockResults report={stockReport} />}
      {meta && meta.totalPages > 1 && <div className="report-pagination"><button className="secondary" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Anterior</button><span>Pagina {meta.page} de {meta.totalPages}</span><button className="secondary" disabled={page >= meta.totalPages} onClick={() => setPage((current) => current + 1)}>Proxima</button></div>}
    </>}
  </>;
}

function MovementResults({ report }: { report: ReportResult<MovementReportItem, MovementReportTotals> }) {
  return <><section className="report-summary"><article><span>Movimentacoes filtradas</span><strong>{report.totals.movements}</strong></article><article><span>Efetivadas</span><strong>{report.totals.effectiveMovements}</strong></article><article><span>Canceladas</span><strong>{report.totals.canceledMovements}</strong></article><article><span>Quantidade valida</span><strong>{quantityLabel(report.totals.effectiveQuantityByUnit)}</strong></article></section>{report.items.length === 0 ? <EmptyState title="Nenhuma movimentacao encontrada" description="Ajuste ou limpe os filtros." /> : <section className="report-list">{report.items.map((item) => <article className="surface report-card" key={`${item.movementId}:${item.productCode}:${item.batchCode}`}><header><div><p className="eyebrow">{movementLabels[item.type]}</p><h2>{item.productCode} - {item.productName}</h2></div><span className={`badge ${item.status === 'EFETIVADA' ? 'active' : 'canceled'}`}>{item.status === 'EFETIVADA' ? 'Efetivada' : 'Cancelada'}</span></header><dl><dt>Data</dt><dd>{formatDateTime(item.occurredAt)}</dd><dt>Lote</dt><dd>{item.batchCode}{item.destinationBatchCode ? ` → ${item.destinationBatchCode}` : ''}</dd><dt>Rota</dt><dd>{item.origin} → {item.reviewDestinations || item.destination}</dd><dt>Quantidade</dt><dd>{item.quantity.toLocaleString('pt-BR')} {item.unit}</dd><dt>Responsavel</dt><dd>{item.responsible}</dd>{item.status === 'CANCELADA' && <><dt>Cancelamento</dt><dd>{item.canceledAt ? formatDateTime(item.canceledAt) : '-'} por {item.canceledBy}<br />{item.cancellationReason}</dd></>}</dl></article>)}</section>}</>;
}

function ReviewResults({ report }: { report: ReportResult<ReviewReportItem, ReviewReportTotals> }) {
  return <><section className="report-summary"><article><span>Total revisado</span><strong>{quantityLabel(report.totals.reviewedQuantityByUnit)}</strong></article>{report.totals.byClassification.map((total) => <article key={`${total.destinationLocationId}:${total.unit}`}><span>{total.destination}</span><strong>{total.quantity.toLocaleString('pt-BR')} {total.unit}</strong></article>)}</section>{report.items.length === 0 ? <EmptyState title="Nenhuma classificacao encontrada" description="Somente revisoes efetivadas entram nos totais." /> : <section className="report-list">{report.items.map((item) => <article className="surface report-card" key={`${item.movementId}:${item.productCode}:${item.destination}`}><header><div><p className="eyebrow">{formatDateTime(item.occurredAt)}</p><h2>{item.productCode} - {item.productName}</h2></div><span className="badge active">{item.destination}</span></header><dl><dt>Lote</dt><dd>{item.batchCode}</dd><dt>Quantidade</dt><dd>{item.quantity.toLocaleString('pt-BR')} {item.unit}</dd><dt>Responsavel</dt><dd>{item.responsible}</dd></dl></article>)}</section>}</>;
}

function StockResults({ report }: { report: ReportResult<StockReportItem, StockReportTotals> }) {
  return <><section className="report-summary"><article><span>Posicoes</span><strong>{report.totals.positions}</strong></article><article><span>Saldo filtrado</span><strong>{quantityLabel(report.totals.quantityByUnit)}</strong></article></section>{report.items.length === 0 ? <EmptyState title="Nenhuma posicao encontrada" description="Ajuste a validade ou os demais filtros." /> : <section className="report-list">{report.items.map((item) => <article className="surface report-card" key={item.positionId}><header><div><p className="eyebrow">{item.location}</p><h2>{item.productCode} - {item.productName}</h2></div><span className={`badge expiration-${item.expirationStatus.toLowerCase()}`}>{expirationLabel(item.expirationStatus)}</span></header><dl><dt>Lote</dt><dd>{item.batchCode}</dd><dt>Fabricacao</dt><dd>{formatDate(item.manufacturingDate)}</dd><dt>Validade</dt><dd>{formatDate(item.expirationDate)}</dd><dt>Saldo</dt><dd>{item.quantity.toLocaleString('pt-BR')} {item.unit}</dd></dl></article>)}</section>}</>;
}
