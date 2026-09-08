import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api, MovementReportItem, MovementReportTotals, ReportResult } from './api';
import { EmptyState, LoadingState, Notice, PageHeader } from './components';
import { formatDateTime } from './format';

interface MovementFilters {
  dateFrom: string;
  dateTo: string;
  type: string;
  product: string;
  batch: string;
  status: string;
}

const initialFilters: MovementFilters = {
  dateFrom: '', dateTo: '', type: '', product: '', batch: '', status: '',
};

const movementLabels: Record<MovementReportItem['type'], string> = {
  ENTRADA_EXTERNA: 'Entrada externa',
  SAIDA_EXTERNA: 'Saida externa',
  TRANSFERENCIA_INTERNA: 'Transferencia interna',
  REVISAO: 'Revisao',
};

function queryString(filters: MovementFilters, page: number): string {
  const params = new URLSearchParams({ page: String(page), limit: '20' });
  (Object.entries(filters) as Array<[keyof MovementFilters, string]>).forEach(([key, value]) => {
    if (!value) return;
    if (key === 'dateFrom' || key === 'dateTo') {
      const time = key === 'dateFrom' ? '00:00:00.000' : '23:59:59.999';
      params.set(key, new Date(`${value}T${time}`).toISOString());
      return;
    }
    params.set(key, value);
  });
  return params.toString();
}

function quantityLabel(values: Array<{ unit: string; quantity: number }>): string {
  if (values.length === 0) return '0';
  return values.map(({ quantity, unit }) => `${quantity.toLocaleString('pt-BR')} ${unit}`).join(' | ');
}

export function ReportsPage() {
  const [draft, setDraft] = useState<MovementFilters>({ ...initialFilters });
  const [applied, setApplied] = useState<MovementFilters>({ ...initialFilters });
  const [page, setPage] = useState(1);
  const [report, setReport] = useState<ReportResult<MovementReportItem, MovementReportTotals> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const activeFilters = useMemo(() => Object.values(applied).filter(Boolean).length, [applied]);
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setReport(await api.get<ReportResult<MovementReportItem, MovementReportTotals>>(
        `/reports/movements?${queryString(applied, page)}`,
      ));
    } catch (caught) {
      setReport(null);
      setError(caught instanceof Error ? caught.message : 'Nao foi possivel carregar o relatorio.');
    } finally {
      setLoading(false);
    }
  }, [applied, page]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  function applyFilters(event: FormEvent): void {
    event.preventDefault();
    setApplied({ ...draft });
    setPage(1);
  }

  function clearFilters(): void {
    setDraft({ ...initialFilters });
    setApplied({ ...initialFilters });
    setPage(1);
  }

  return <>
    <PageHeader eyebrow="Relatorios" title="Movimentacoes" description="Consulte movimentacoes e totais conforme os filtros selecionados." />
    {error && <Notice kind="error" onClose={() => setError('')}>{error}</Notice>}
    <section className="surface filters-panel filters-open report-filters">
      <div className="panel-heading">
        <div><p className="eyebrow">Filtros</p><h2>{activeFilters} filtro(s) ativo(s)</h2></div>
        <button type="button" className="secondary" onClick={clearFilters}>Limpar filtros</button>
      </div>
      <form className="filter-grid" onSubmit={applyFilters}>
        <label>De<input type="date" value={draft.dateFrom} onChange={(event) => setDraft({ ...draft, dateFrom: event.target.value })} /></label>
        <label>Ate<input type="date" value={draft.dateTo} onChange={(event) => setDraft({ ...draft, dateTo: event.target.value })} /></label>
        <label>Tipo<select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })}><option value="">Todos</option><option value="ENTRADA_EXTERNA">Entrada externa</option><option value="SAIDA_EXTERNA">Saida externa</option><option value="TRANSFERENCIA_INTERNA">Transferencia interna</option><option value="REVISAO">Revisao</option></select></label>
        <label>Produto<input value={draft.product} onChange={(event) => setDraft({ ...draft, product: event.target.value })} maxLength={200} placeholder="Codigo ou nome" /></label>
        <label>Lote<input value={draft.batch} onChange={(event) => setDraft({ ...draft, batch: event.target.value.toUpperCase() })} maxLength={6} placeholder="Codigo do lote" /></label>
        <label>Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option value="">Todos</option><option value="EFETIVADA">Efetivada</option><option value="CANCELADA">Cancelada</option></select></label>
        <div className="form-actions report-filter-actions"><button>Aplicar filtros</button></div>
      </form>
    </section>
    {loading ? <LoadingState label="Carregando relatorio" /> : report && <>
      <ReportTotals totals={report.totals} />
      <MovementResults items={report.items} />
      {report.meta.totalPages > 1 && <div className="report-pagination">
        <button className="secondary" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Anterior</button>
        <span>Pagina {report.meta.page} de {report.meta.totalPages}</span>
        <button className="secondary" disabled={page >= report.meta.totalPages} onClick={() => setPage((current) => current + 1)}>Proxima</button>
      </div>}
    </>}
  </>;
}

function ReportTotals({ totals }: { totals: MovementReportTotals }) {
  return <section className="report-summary" aria-label="Totais do relatorio">
    <article><span>Movimentacoes</span><strong>{totals.movements}</strong></article>
    <article><span>Efetivadas</span><strong>{totals.effectiveMovements}</strong></article>
    <article><span>Canceladas</span><strong>{totals.canceledMovements}</strong></article>
    <article><span>Quantidade valida</span><strong>{quantityLabel(totals.effectiveQuantityByUnit)}</strong></article>
  </section>;
}

function MovementResults({ items }: { items: MovementReportItem[] }) {
  if (items.length === 0) {
    return <EmptyState title="Nenhuma movimentacao encontrada" description="Ajuste ou limpe os filtros." />;
  }
  return <section className="surface list-panel">
    <div className="responsive-table"><table>
      <thead><tr><th>Data</th><th>Tipo</th><th>Produto/lote</th><th>Origem/destino</th><th>Quantidade</th><th>Status</th></tr></thead>
      <tbody>{items.map((item) => <tr key={item.itemId}>
        <td data-label="Data">{formatDateTime(item.occurredAt)}</td>
        <td data-label="Tipo">{movementLabels[item.type]}</td>
        <td data-label="Produto/lote"><strong>{item.productCode} - {item.productName}</strong><small className="cell-note">Lote {item.batchCode}{item.destinationBatchCode ? ` para ${item.destinationBatchCode}` : ''}</small></td>
        <td data-label="Origem/destino">{item.origin}<small className="cell-note">para {item.reviewDestinations || item.destination}</small></td>
        <td data-label="Quantidade" className="quantity">{item.quantity.toLocaleString('pt-BR')} {item.unit}</td>
        <td data-label="Status"><span className={`badge ${item.status === 'EFETIVADA' ? 'active' : 'canceled'}`}>{item.status === 'EFETIVADA' ? 'Efetivada' : 'Cancelada'}</span><small className="cell-note">{item.responsible}</small></td>
      </tr>)}</tbody>
    </table></div>
  </section>;
}
