import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api, ReportResult, ReviewReportItem, ReviewReportTotals } from './api';
import { EmptyState, FilterPanel, LoadingState, Notice, PageHeader } from './components';
import { formatDateTime } from './format';
import { ReportNavigation } from './ReportNavigation';
import { buildReportQuery, formatQuantities, ReportFilters } from './report-utils';

interface ReviewFilters extends ReportFilters {
  dateFrom: string;
  dateTo: string;
  product: string;
  batch: string;
  destination: string;
}

const initialFilters: ReviewFilters = {
  dateFrom: '', dateTo: '', product: '', batch: '', destination: '',
};

export function ReviewReportsPage({ onMovements, onStock }: { onMovements: () => void; onStock?: () => void }) {
  const [draft, setDraft] = useState<ReviewFilters>({ ...initialFilters });
  const [applied, setApplied] = useState<ReviewFilters>({ ...initialFilters });
  const [page, setPage] = useState(1);
  const [report, setReport] = useState<ReportResult<ReviewReportItem, ReviewReportTotals> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const activeFilters = useMemo(() => Object.values(applied).filter(Boolean).length, [applied]);
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setReport(await api.get<ReportResult<ReviewReportItem, ReviewReportTotals>>(
        `/reports/reviews?${buildReportQuery(applied, page)}`,
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
    <PageHeader eyebrow="Relatorios" title="Revisoes" description="Consulte as quantidades revisadas e sua distribuicao por classificacao." />
    <ReportNavigation current="reviews" onMovements={onMovements} onReviews={() => undefined} onStock={onStock} />
    {error && <Notice kind="error" onClose={() => setError('')}>{error}</Notice>}
    <FilterPanel count={activeFilters}>
      <div className="panel-heading">
        <p className="muted">Ajuste os campos e aplique os filtros.</p>
        <button type="button" className="secondary" onClick={clearFilters}>Limpar filtros</button>
      </div>
      <form className="filter-grid" onSubmit={applyFilters}>
        <label>De<input type="date" value={draft.dateFrom} onChange={(event) => setDraft({ ...draft, dateFrom: event.target.value })} /></label>
        <label>Ate<input type="date" value={draft.dateTo} onChange={(event) => setDraft({ ...draft, dateTo: event.target.value })} /></label>
        <label>Produto<input value={draft.product} onChange={(event) => setDraft({ ...draft, product: event.target.value })} maxLength={200} placeholder="Codigo ou nome" /></label>
        <label>Lote<input value={draft.batch} onChange={(event) => setDraft({ ...draft, batch: event.target.value.toUpperCase() })} maxLength={6} placeholder="Codigo do lote" /></label>
        <label>Classificacao/destino<input value={draft.destination} onChange={(event) => setDraft({ ...draft, destination: event.target.value })} maxLength={150} placeholder="Lata Boa, Varejo ou TUF" /></label>
        <div className="form-actions report-filter-actions"><button>Aplicar filtros</button></div>
      </form>
    </FilterPanel>
    {loading ? <LoadingState label="Carregando relatorio" /> : report && <>
      <ReviewTotals totals={report.totals} />
      <ReviewResults items={report.items} />
      {report.meta.totalPages > 1 && <div className="report-pagination">
        <button className="secondary" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Anterior</button>
        <span>Pagina {report.meta.page} de {report.meta.totalPages}</span>
        <button className="secondary" disabled={page >= report.meta.totalPages} onClick={() => setPage((current) => current + 1)}>Proxima</button>
      </div>}
    </>}
  </>;
}

function ReviewTotals({ totals }: { totals: ReviewReportTotals }) {
  return <section className="report-summary" aria-label="Totais do relatorio">
    <article><span>Total revisado</span><strong>{formatQuantities(totals.reviewedQuantityByUnit)}</strong></article>
    {totals.byClassification.map((classification) => <article key={classification.destinationLocationId}>
      <span>{classification.destination}</span>
      <strong>{formatQuantities(classification.quantityByUnit)}</strong>
    </article>)}
  </section>;
}

function ReviewResults({ items }: { items: ReviewReportItem[] }) {
  if (items.length === 0) {
    return <EmptyState title="Nenhuma revisao encontrada" description="Ajuste ou limpe os filtros." />;
  }
  return <section className="surface list-panel">
    <div className="responsive-table"><table>
      <thead><tr><th>Data</th><th>Produto/lote</th><th>Classificacao</th><th>Quantidade</th><th>Responsavel</th></tr></thead>
      <tbody>{items.map((item) => <tr key={item.distributionId}>
        <td data-label="Data">{formatDateTime(item.occurredAt)}</td>
        <td data-label="Produto/lote"><strong>{item.productCode} - {item.productName}</strong><small className="cell-note">Lote {item.batchCode}</small></td>
        <td data-label="Classificacao"><span className="badge active">{item.destination}</span></td>
        <td data-label="Quantidade" className="quantity">{item.quantity.toLocaleString('pt-BR')} {item.unit}</td>
        <td data-label="Responsavel">{item.responsible}</td>
      </tr>)}</tbody>
    </table></div>
  </section>;
}
