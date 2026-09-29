import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, Paginated, ReportResult, StockLocation, StockProductReportItem, StockReportItem, StockReportTotals } from './api';
import { EmptyState, FilterPanel, LoadingState, Notice, PageHeader } from './components';
import { formatDate } from './format';
import { ReportNavigation } from './ReportNavigation';
import { buildReportQuery, formatQuantities, ReportFilters } from './report-utils';

interface StockFilters extends ReportFilters {
  product: string;
  batch: string;
  location: string;
  expirationStatus: string;
  sort: string;
}

const initialFilters: StockFilters = {
  product: '', batch: '', location: '', expirationStatus: '', sort: 'EXPIRATION',
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
  const [parentId, setParentId] = useState('');
  const [childId, setChildId] = useState('');
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [locationError, setLocationError] = useState('');
  const [report, setReport] = useState<ReportResult<StockReportItem, StockReportTotals> | null>(null);
  const [productReport, setProductReport] = useState<ReportResult<StockProductReportItem, StockReportTotals> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestVersion = useRef(0);

  const parents = locations.filter((location) => location.kind === 'STOCK');
  const selectedParent = parents.find((location) => location.id === parentId);
  const children = locations.filter((location) => location.parentId === parentId && location.kind === 'SUBSTOCK');
  const locationId = childId || parentId;
  const selectedLocation = locations.find((location) => location.id === locationId);
  const grouped = selectedLocation?.displayMode === 'PRODUCTS';
  const includeSubstocks = Boolean(parentId && !childId);
  const activeFilters = useMemo(() => Object.entries(applied).filter(([key, value]) => value && !(key === 'sort' && value === 'EXPIRATION')).length + Number(Boolean(parentId)), [applied, parentId]);
  useEffect(() => {
    let current = true;
    async function loadLocations(): Promise<void> {
      try {
        const all: StockLocation[] = [];
        let pageNumber = 1;
        let totalPages = 1;
        do {
          const result = await api.get<Paginated<StockLocation>>(`/stocks?active=true&limit=100&page=${pageNumber}`);
          all.push(...result.items.filter((location) => location.kind !== 'EXTERNAL'));
          totalPages = result.meta.totalPages;
          pageNumber += 1;
        } while (pageNumber <= totalPages);
        if (current) setLocations(all);
      } catch (caught) {
        if (current) setLocationError(caught instanceof Error ? caught.message : 'Não foi possível carregar os locais.');
      }
    }
    void loadLocations();
    return () => { current = false; };
  }, []);
  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams(buildReportQuery(applied, page));
      if (locationId) params.set('stockLocationId', locationId);
      if (includeSubstocks) params.set('includeSubstocks', 'true');
      if (grouped) {
        const result = await api.get<ReportResult<StockProductReportItem, StockReportTotals>>(`/reports/stock/products?${params}`);
        if (version === requestVersion.current) { setProductReport(result); setReport(null); }
      } else {
        const result = await api.get<ReportResult<StockReportItem, StockReportTotals>>(`/reports/stock?${params}`);
        if (version === requestVersion.current) { setReport(result); setProductReport(null); }
      }
    } catch (caught) {
      if (version === requestVersion.current) {
        setReport(null);
        setProductReport(null);
        setError(caught instanceof Error ? caught.message : 'Nao foi possivel carregar o relatorio.');
      }
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [applied, page, locationId, grouped, includeSubstocks]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  function applyFilters(event: FormEvent): void {
    event.preventDefault();
    setApplied({ ...draft });
    setPage(1);
    if (draft.location) { setParentId(''); setChildId(''); }
  }

  function clearFilters(): void {
    setDraft({ ...initialFilters });
    setApplied({ ...initialFilters });
    setPage(1);
    setParentId('');
    setChildId('');
  }

  function selectParent(id: string): void {
    setParentId(id);
    setChildId('');
    setDraft((current) => ({ ...current, location: '' }));
    setApplied((current) => ({ ...current, location: '' }));
    setPage(1);
  }

  function selectChild(id: string): void {
    setChildId(id);
    setPage(1);
  }

  return <>
    <PageHeader eyebrow="Consulta de estoque" title="Estoque e validades" description="Veja quanto há disponível em cada produto, lote e local. Envios em trânsito aparecem em Envios e recebimentos." />
    {(onMovements || onReviews) && <ReportNavigation current="stock" onMovements={onMovements} onReviews={onReviews} onStock={() => undefined} />}
    {error && <Notice kind="error" onClose={() => setError('')}>{error}</Notice>}
    {locationError && <Notice kind="error" onClose={() => setLocationError('')}>{locationError}</Notice>}
    <FilterPanel count={activeFilters}>
      <div className="panel-heading">
        <p className="muted">Ajuste os campos e aplique os filtros.</p>
        <button type="button" className="secondary" onClick={clearFilters}>Limpar filtros</button>
      </div>
      <form className="filter-grid" onSubmit={applyFilters}>
        <label>Produto<input value={draft.product} onChange={(event) => setDraft({ ...draft, product: event.target.value })} maxLength={200} placeholder="Codigo ou nome" /></label>
        <label>Lote<input value={draft.batch} onChange={(event) => setDraft({ ...draft, batch: event.target.value.toUpperCase() })} maxLength={6} placeholder="Codigo do lote" /></label>
        <label>Local/classificação<input value={draft.location} onChange={(event) => { setDraft({ ...draft, location: event.target.value }); setParentId(''); setChildId(''); }} maxLength={150} placeholder="Buscar em todos os locais" /></label>
        <label>Situacao da validade<select value={draft.expirationStatus} onChange={(event) => setDraft({ ...draft, expirationStatus: event.target.value })}><option value="">Todas</option><option value="VALIDO">Valido</option><option value="PROXIMO_VENCIMENTO">Proximo do vencimento</option><option value="VENCIDO">Vencido</option></select></label>
        <label>Ordenar por<select value={draft.sort} onChange={(event) => setDraft({ ...draft, sort: event.target.value })}><option value="EXPIRATION">Validade mais próxima</option><option value="PRODUCT">Produto</option><option value="QUANTITY">Maior saldo</option></select></label>
        <div className="form-actions report-filter-actions"><button>Aplicar filtros</button></div>
      </form>
    </FilterPanel>
    <section className="stock-location-picker" aria-label="Selecionar local do estoque">
      <div className="stock-location-picker-heading"><strong>Estoque</strong><span>Selecione o estoque principal.</span></div>
      <div className="stock-location-tabs" role="group" aria-label="Estoque principal">
        <button type="button" className={!parentId ? 'current' : ''} aria-pressed={!parentId} onClick={() => selectParent('')}>Todos</button>
        {parents.map((location) => <button type="button" key={location.id} className={parentId === location.id ? 'current' : ''} aria-pressed={parentId === location.id} onClick={() => selectParent(location.id)}>{location.name}</button>)}
      </div>
      {selectedParent && <div className="stock-child-picker" aria-label={`Locais de ${selectedParent.name}`}>
        <div className="stock-location-picker-heading"><strong>Local em {selectedParent.name}</strong><span>Geral reúne o estoque principal e seus locais filhos.</span></div>
        <div className="stock-location-tabs" role="group" aria-label={`Local em ${selectedParent.name}`}>
          <button type="button" className={!childId ? 'current' : ''} aria-pressed={!childId} onClick={() => selectChild('')}>Geral</button>
          {children.map((location) => <button type="button" key={location.id} className={childId === location.id ? 'current' : ''} aria-pressed={childId === location.id} onClick={() => selectChild(location.id)}>{location.name}</button>)}
        </div>
      </div>}
      {selectedLocation && <small>Exibição: {grouped ? 'total por produto; lotes nos detalhes' : 'posições separadas por lote e validade'}.</small>}
    </section>
    {loading ? <LoadingState label="Carregando estoque" /> : (report || productReport) && <>
      <section className="report-summary" aria-label="Totais do relatorio">
        <article><span>Posições</span><strong>{(report ?? productReport)?.totals.positions}</strong></article>
        <article><span>Saldo disponível filtrado</span><strong>{formatQuantities((report ?? productReport)?.totals.quantityByUnit ?? [])}</strong></article>
      </section>
      {productReport ? <StockProductResults items={productReport.items} /> : <StockResults items={report?.items ?? []} />}
      {(report ?? productReport)!.meta.totalPages > 1 && <div className="report-pagination">
        <button className="secondary" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Anterior</button>
        <span>Página {(report ?? productReport)!.meta.page} de {(report ?? productReport)!.meta.totalPages}</span>
        <button className="secondary" disabled={page >= (report ?? productReport)!.meta.totalPages} onClick={() => setPage((current) => current + 1)}>Próxima</button>
      </div>}
    </>}
  </>;
}

export function StockProductResults({ items }: { items: StockProductReportItem[] }) {
  if (!items.length) return <EmptyState title="Nenhum produto encontrado" description="Ajuste ou limpe os filtros." />;
  return <section className="stock-product-list" aria-label="Estoque por produto">
    {items.map((item) => <article className="surface stock-product-card" key={item.productId}>
      <div className="stock-product-card-heading"><div><strong>{item.productCode} — {item.productName}</strong><span>{item.positions.length} posição(ões) filtrada(s)</span></div><b>{item.quantity.toLocaleString('pt-BR')} {item.unit}</b></div>
      <details><summary>Ver lotes, validades e posições</summary>
        <div className="stock-product-positions">{item.positions.map((position) => <div key={position.positionId} className="stock-product-position">
          <div><strong>Lote {position.batchCode}</strong><span>{position.location}</span></div>
          <div><span>Prod. {formatDate(position.manufacturingDate)} · Val. {formatDate(position.expirationDate)}</span><span className={`badge expiration-${position.expirationStatus.toLowerCase()}`}>{expirationLabels[position.expirationStatus]}</span></div>
          <strong className="quantity">{position.quantity.toLocaleString('pt-BR')} {position.unit}</strong>
        </div>)}</div>
      </details>
    </article>)}
  </section>;
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
