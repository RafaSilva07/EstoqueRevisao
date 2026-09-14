import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api, ReportResult, StockReportItem, StockReportTotals } from './api';
import { EmptyState, FilterPanel, LoadingState, Notice, PageHeader } from './components';
import { formatDate } from './format';
import { ReportNavigation } from './ReportNavigation';
import { buildReportQuery, formatQuantities, ReportFilters } from './report-utils';

interface StockFilters extends ReportFilters {
  product: string;
  batch: string;
  location: string;
  expirationStatus: string;
}

const initialFilters: StockFilters = {
  product: '', batch: '', location: '', expirationStatus: '',
};

const expirationLabels: Record<StockReportItem['expirationStatus'], string> = {
  VALIDO: 'Valido',
  PROXIMO_VENCIMENTO: 'Proximo do vencimento',
  VENCIDO: 'Vencido',
};

export function StockReportsPage({
  onMovements,
  onReviews,
}: {
  onMovements?: () => void;
  onReviews?: () => void;
}) {
  const [draft, setDraft] = useState<StockFilters>({ ...initialFilters });
  const [applied, setApplied] = useState<StockFilters>({ ...initialFilters });
  const [page, setPage] = useState(1);
  const [report, setReport] = useState<ReportResult<StockReportItem, StockReportTotals> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const activeFilters = useMemo(() => Object.values(applied).filter(Boolean).length, [applied]);
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setReport(await api.get<ReportResult<StockReportItem, StockReportTotals>>(
        `/reports/stock?${buildReportQuery(applied, page)}`,
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
    <PageHeader eyebrow="Relatorios" title="Estoque e validades" description="Consulte saldos disponíveis e validades. Quantidades em trânsito ficam em Envios." />
    <ReportNavigation current="stock" onMovements={onMovements} onReviews={onReviews} onStock={() => undefined} />
    {error && <Notice kind="error" onClose={() => setError('')}>{error}</Notice>}
    <FilterPanel count={activeFilters}>
      <div className="panel-heading">
        <p className="muted">Ajuste os campos e aplique os filtros.</p>
        <button type="button" className="secondary" onClick={clearFilters}>Limpar filtros</button>
      </div>
      <form className="filter-grid" onSubmit={applyFilters}>
        <label>Produto<input value={draft.product} onChange={(event) => setDraft({ ...draft, product: event.target.value })} maxLength={200} placeholder="Codigo ou nome" /></label>
        <label>Lote<input value={draft.batch} onChange={(event) => setDraft({ ...draft, batch: event.target.value.toUpperCase() })} maxLength={6} placeholder="Codigo do lote" /></label>
        <label>Local/classificacao<input value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} maxLength={150} /></label>
        <label>Situacao da validade<select value={draft.expirationStatus} onChange={(event) => setDraft({ ...draft, expirationStatus: event.target.value })}><option value="">Todas</option><option value="VALIDO">Valido</option><option value="PROXIMO_VENCIMENTO">Proximo do vencimento</option><option value="VENCIDO">Vencido</option></select></label>
        <div className="form-actions report-filter-actions"><button>Aplicar filtros</button></div>
      </form>
    </FilterPanel>
    {loading ? <LoadingState label="Carregando relatorio" /> : report && <>
      <section className="report-summary" aria-label="Totais do relatorio">
        <article><span>Posicoes</span><strong>{report.totals.positions}</strong></article>
        <article><span>Saldo disponível filtrado</span><strong>{formatQuantities(report.totals.quantityByUnit)}</strong></article>
      </section>
      <StockResults items={report.items} />
      {report.meta.totalPages > 1 && <div className="report-pagination">
        <button className="secondary" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Anterior</button>
        <span>Pagina {report.meta.page} de {report.meta.totalPages}</span>
        <button className="secondary" disabled={page >= report.meta.totalPages} onClick={() => setPage((current) => current + 1)}>Proxima</button>
      </div>}
    </>}
  </>;
}

function StockResults({ items }: { items: StockReportItem[] }) {
  if (items.length === 0) {
    return <EmptyState title="Nenhuma posicao encontrada" description="Ajuste ou limpe os filtros." />;
  }
  return <section className="surface list-panel">
    <div className="responsive-table"><table>
      <thead><tr><th>Produto/lote</th><th>Local</th><th>Fabricacao</th><th>Validade</th><th>Saldo</th><th>Situacao</th></tr></thead>
      <tbody>{items.map((item) => <tr key={item.positionId}>
        <td data-label="Produto/lote"><strong>{item.productCode} - {item.productName}</strong><small className="cell-note">Lote {item.batchCode}</small></td>
        <td data-label="Local">{item.location}</td>
        <td data-label="Fabricacao">{formatDate(item.manufacturingDate)}</td>
        <td data-label="Validade">{formatDate(item.expirationDate)}</td>
        <td data-label="Saldo" className="quantity">{item.quantity.toLocaleString('pt-BR')} {item.unit}</td>
        <td data-label="Situacao"><span className={`badge expiration-${item.expirationStatus.toLowerCase()}`}>{expirationLabels[item.expirationStatus]}</span></td>
      </tr>)}</tbody>
    </table></div>
  </section>;
}
