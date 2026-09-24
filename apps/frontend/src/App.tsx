import { FormEvent, ReactNode, useCallback, useEffect, useState } from 'react';
import { api, Batch, Movement, Paginated, Product, StockLocation, StockLocationKind, StockPosition, UnitConversion, UserSession } from './api';
import { ConfirmDialog, EmptyState, FilterPanel, LoadingState, Modal, Notice, PageHeader } from './components';
import { formatDate, formatDateTime } from './format';
import { ExternalExitPage } from './ExternalExitPage';
import { InternalTransferPage, TransferPrefill } from './InternalTransferPage';
import { ReviewPage, ReviewPrefill } from './ReviewPage';
import { ExternalEntryPage } from './ExternalEntryPage';
import { MovementCancellationDialog } from './MovementCancellationDialog';
import { ReportsPage } from './ReportsPage';
import { ReviewReportsPage } from './ReviewReportsPage';
import { StockReportsPage } from './StockReportsPage';
import { Login } from './Login';
import { ShipmentsPage } from './ShipmentsPage';
import { NavigationTrail, SectionMenu } from './Navigation';
import { homeActions, Page, parentPage } from './navigation-model';
import { Sector } from './shipments';
import { UsersPage } from './UsersPage';
import { SettingsPage } from './SettingsPage';
import { ProductForm } from './ProductForm';
import { ProductAuditPanel } from './ProductAuditPanel';
import { PcpPage } from './PcpPage';
import { MovementDetailModal } from './MovementDetailModal';
import { OperationalMode, operationalModeLabel, userForOperationalMode } from './operational-mode';
import { OperationalHomePage } from './OperationalHomePage';
import { HistoryPage } from './HistoryPage';

type Navigate = (page: Page) => void;
const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'Ocorreu um erro inesperado.';

function revealDetails() {
  if (!window.matchMedia('(max-width: 1399px)').matches) return;
  requestAnimationFrame(() => {
    const panel = document.querySelector<HTMLElement>('.detail-panel');
    panel?.scrollIntoView({ block: 'start' });
    panel?.focus({ preventScroll: true });
  });
}

function ProductsPage({ canWrite, canManageStatus, canReadConversions }: { canWrite: boolean; canManageStatus: boolean; canReadConversions: boolean }) {
  const [products, setProducts] = useState<Product[]>([]); const [selected, setSelected] = useState<Product | null>(null); const [conversions, setConversions] = useState<UnitConversion[]>([]);
  const [search, setSearch] = useState(''); const [error, setError] = useState(''); const [success, setSuccess] = useState(''); const [editing, setEditing] = useState<Product | null>(null);
  const [showForm, setShowForm] = useState(false); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [confirming, setConfirming] = useState<Product | null>(null);
  const load = useCallback(async () => { setLoading(true); try { setProducts((await api.get<Paginated<Product>>(`/products?limit=100&search=${encodeURIComponent(search)}`)).items); setError(''); } catch (caught) { setError(messageFrom(caught)); } finally { setLoading(false); } }, [search]);
  useEffect(() => { const timeout = window.setTimeout(() => void load(), 250); return () => window.clearTimeout(timeout); }, [load]);
  function openForm(product: Product | null) { setEditing(product); setShowForm(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  async function save(payload: Record<string, unknown>) { if (busy) return; setBusy(true); try { const saved = editing ? await api.patch<Product>(`/products/${editing.id}`, payload) : await api.post<Product>('/products', payload); setSelected(saved); setSuccess(editing ? 'Produto atualizado com sucesso.' : 'Produto cadastrado com sucesso.'); setShowForm(false); setEditing(null); await load(); } catch (caught) { setError(messageFrom(caught)); } finally { setBusy(false); } }
  async function select(product: Product) { setSelected(product); revealDetails(); if (!canReadConversions) return; try { setConversions(await api.get(`/products/${product.id}/conversions`)); } catch (caught) { setError(messageFrom(caught)); } }
  async function addConversion(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!selected) return; setBusy(true); const form = new FormData(event.currentTarget); try { await api.post(`/products/${selected.id}/conversions`, { fromUnit: form.get('fromUnit'), toUnit: form.get('toUnit'), factor: Number(form.get('factor')) }); setConversions(await api.get(`/products/${selected.id}/conversions`)); event.currentTarget.reset(); setSuccess('Conversao adicionada com sucesso.'); } catch (caught) { setError(messageFrom(caught)); } finally { setBusy(false); } }
  async function toggle(product: Product) { setBusy(true); try { await api.patch(`/products/${product.id}/status`, { active: !product.active }); setSuccess(product.active ? 'Produto inativado com sucesso.' : 'Produto ativado com sucesso.'); setConfirming(null); await load(); } catch (caught) { setError(messageFrom(caught)); } finally { setBusy(false); } }
  return <><PageHeader eyebrow="Cadastro base" title="Produtos" description="Cadastre, edite ou exclua produtos. A exclusão inativa o cadastro sem apagar o histórico." action={canWrite && <button onClick={() => openForm(null)}>+ Novo produto</button>} />{success && <Notice kind="success" onClose={() => setSuccess('')}>{success}</Notice>}{error && <Notice kind="error" onClose={() => setError('')}>{error}</Notice>}{showForm && <Modal labelledBy="product-form-title" busy={busy} onClose={() => setShowForm(false)}><h2 id="product-form-title">{editing ? 'Editar produto' : 'Cadastrar produto'}</h2>{error && <Notice kind="error">{error}</Notice>}<ProductForm key={editing?.id ?? 'new'} product={editing} busy={busy} onSave={save} onCancel={() => setShowForm(false)} /></Modal>}<div className="content-grid"><section className="surface list-panel"><div className="toolbar"><label className="search-field">Buscar produto<input type="search" placeholder="Codigo ou nome" value={search} onChange={(event) => setSearch(event.target.value)} /></label></div>{loading ? <LoadingState label="Carregando produtos" /> : products.length === 0 ? <EmptyState title={search ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado'} description={search ? 'Revise o termo de busca.' : 'Cadastre o primeiro produto para comecar.'} action={canWrite && !search ? <button onClick={() => openForm(null)}>Cadastrar produto</button> : undefined} /> : <div className="responsive-table"><table><thead><tr><th>Codigo</th><th>Produto</th><th>Unidade</th><th>Status</th><th>Acoes</th></tr></thead><tbody>{products.map((product) => <tr key={product.id} className={selected?.id === product.id ? 'selected' : ''}><td data-label="Codigo"><button className="text-button" onClick={() => void select(product)}>{product.code}</button></td><td data-label="Produto">{product.name}</td><td data-label="Unidade">{product.defaultUnit}</td><td data-label="Status"><Status active={product.active} /></td><td data-label="Acoes"><div className="row-actions">{canWrite && <><button className="secondary" onClick={() => openForm(product)}>Editar</button>{<button className="secondary" onClick={() => product.active ? setConfirming(product) : void toggle(product)}>{product.active ? 'Excluir' : 'Reativar'}</button>}</>}</div></td></tr>)}</tbody></table></div>}</section><aside className="surface detail-panel" tabIndex={-1}><p className="eyebrow">Detalhes</p><h2>{selected?.name ?? 'Selecione um produto'}</h2>{selected ? <><dl><dt>Codigo</dt><dd>{selected.code}</dd><dt>Unidade</dt><dd>{selected.defaultUnit}</dd>{['FD', 'CX'].includes(selected.defaultUnit) && <><dt>Unidades por embalagem</dt><dd>{selected.unitsPerPackage ?? 'Configuração pendente'}</dd><dt>Códigos unitários possíveis</dt><dd>{selected.unitProducts?.map((product) => `${product.code} — ${product.name}`).join('; ') || 'Configuração pendente'}</dd></>}<dt>Prazo padrão</dt><dd>{selected.shelfLifeYears ? `${selected.shelfLifeYears} ano(s)` : 'Ainda não informado'}</dd><dt>Status</dt><dd>{selected.active ? 'Ativo' : 'Inativo'}</dd></dl>{canReadConversions && <><div className="divider" /><h3>Conversoes de unidade</h3>{conversions.length === 0 ? <p className="muted">Nenhuma conversao cadastrada.</p> : <ul className="conversion-list">{conversions.map((item) => <li key={item.id}><strong>{item.fromUnit}</strong><span>1 × {item.factor} = {item.factor} {item.toUnit}</span></li>)}</ul>}{canManageStatus && <form className="compact-form" onSubmit={(event) => void addConversion(event)}><label>Origem<input name="fromUnit" required /></label><label>Destino<input name="toUnit" required /></label><label>Fator<input name="factor" type="number" min="0.000001" step="0.000001" required /></label><button disabled={busy}>{busy ? 'Adicionando...' : 'Adicionar conversao'}</button></form>}</>}</> : <p className="muted">Toque no codigo de um produto para ver os detalhes.</p>}</aside></div>{canManageStatus && <ProductAuditPanel />}<ConfirmDialog open={Boolean(confirming)} title="Excluir produto?" description={`O produto ${confirming?.name ?? ''} será inativado, sem apagar o histórico. Pode ser reativado depois.`} confirmLabel="Excluir produto" busy={busy} onCancel={() => setConfirming(null)} onConfirm={() => { if (confirming) void toggle(confirming); }} /></>;
}

export function InventoryPage({ onTransfer, onReview }: { onTransfer?: (prefill: TransferPrefill) => void; onReview?: (prefill: ReviewPrefill) => void }) {
  const [positions, setPositions] = useState<StockPosition[]>([]); const [products, setProducts] = useState<Product[]>([]); const [batches, setBatches] = useState<Batch[]>([]); const [locations, setLocations] = useState<StockLocation[]>([]); const [selected, setSelected] = useState<StockPosition | null>(null);
  const [productId, setProductId] = useState(''); const [batchId, setBatchId] = useState(''); const [stockLocationId, setStockLocationId] = useState(''); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const load = useCallback(async () => { setLoading(true); const query = new URLSearchParams({ limit: '100' }); if (productId) query.set('productId', productId); if (batchId) query.set('batchId', batchId); if (stockLocationId) query.set('stockLocationId', stockLocationId); try { const [positionData, productData, batchData, locationData] = await Promise.all([api.get<Paginated<StockPosition>>(`/stock-positions?${query}`), api.get<Paginated<Product>>('/products?limit=100&active=true'), api.get<Paginated<Batch>>('/batches?limit=100'), api.get<Paginated<StockLocation>>('/stocks?limit=100&active=true')]); setPositions(positionData.items); setProducts(productData.items); setBatches(batchData.items); setLocations(locationData.items); setError(''); } catch (caught) { setError(messageFrom(caught)); } finally { setLoading(false); } }, [batchId, productId, stockLocationId]);
  useEffect(() => { const timeout = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timeout); }, [load]);
  const filters = [productId, batchId, stockLocationId].filter(Boolean).length; const availableBatches = productId ? batches.filter((batch) => batch.productId === productId) : batches; const clear = () => { setProductId(''); setBatchId(''); setStockLocationId(''); };
  return <><PageHeader eyebrow="Consulta operacional" title="Estoque atual" description="Saldo disponível separado por produto, lote, validade e local. Quantidades em trânsito ficam em Envios." />{error && <Notice kind="error">{error}</Notice>}<FilterPanel count={filters}><div className="filter-grid"><label>Produto<select value={productId} onChange={(event) => { setProductId(event.target.value); setBatchId(''); }}><option value="">Todos</option>{products.map((product) => <option key={product.id} value={product.id}>{product.code} — {product.name}</option>)}</select></label><label>Lote<select value={batchId} onChange={(event) => setBatchId(event.target.value)}><option value="">Todos</option>{availableBatches.map((batch) => <option key={batch.id} value={batch.id}>{batch.code} — validade {formatDate(batch.expirationDate)}</option>)}</select></label><label>Local<select value={stockLocationId} onChange={(event) => setStockLocationId(event.target.value)}><option value="">Todos</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.code} — {location.name}</option>)}</select></label></div>{filters > 0 && <button className="text-button" onClick={clear}>Limpar filtros</button>}</FilterPanel><div className="content-grid inventory-grid"><section className="surface list-panel">{loading ? <LoadingState label="Consultando estoque" /> : positions.length === 0 ? <EmptyState title={filters ? 'Nenhuma posicao encontrada' : 'Estoque sem posicoes'} description={filters ? 'Ajuste ou limpe os filtros.' : 'As posicoes aparecerao quando operacoes de estoque forem registradas.'} action={filters ? <button className="secondary" onClick={clear}>Limpar filtros</button> : undefined} /> : <div className="responsive-table"><table><thead><tr><th>Produto</th><th>Lote</th><th>Fabricacao</th><th>Validade</th><th>Local</th><th>Quantidade</th></tr></thead><tbody>{positions.map((position) => <tr key={position.id} className={selected?.id === position.id ? 'selected' : ''} onClick={() => { setSelected(position); revealDetails(); }} tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(position); revealDetails(); } }}><td data-label="Produto"><strong>{position.product.name}</strong><small className="cell-note">{position.product.code}</small></td><td data-label="Lote">{position.batch.code}</td><td data-label="Fabricacao">{formatDate(position.batch.manufacturingDate)}</td><td data-label="Validade">{formatDate(position.batch.expirationDate)}</td><td data-label="Local">{position.stockLocation.name}</td><td data-label="Quantidade"><strong className="quantity">{position.quantity} {position.product.defaultUnit}</strong></td></tr>)}</tbody></table></div>}</section>{selected && <aside className="surface detail-panel" tabIndex={-1}><PanelHeading eyebrow="Detalhes da posicao" title={selected.product.name} onClose={() => setSelected(null)} /><dl><dt>Produto</dt><dd>{selected.product.code}</dd><dt>Lote</dt><dd>{selected.batch.code}</dd><dt>Fabricacao</dt><dd>{formatDate(selected.batch.manufacturingDate)}</dd><dt>Validade</dt><dd>{formatDate(selected.batch.expirationDate)}</dd><dt>Local</dt><dd>{selected.stockLocation.name}</dd><dt>Quantidade</dt><dd>{selected.quantity} {selected.product.defaultUnit}</dd></dl>{onReview && selected.stockLocation.reviewRole === 'SOURCE' && <button className="button-wide" onClick={() => onReview({ productId: selected.productId, batchId: selected.batchId })}>Realizar revisao</button>}{onTransfer && <button className="button-wide secondary" onClick={() => onTransfer({ originLocationId: selected.stockLocationId, productId: selected.productId, batchId: selected.batchId })}>Transferir esta posicao</button>}</aside>}</div></>;
}

function StocksPage({ canWrite, canManageStatus }: { canWrite: boolean; canManageStatus: boolean }) {
  const [locations, setLocations] = useState<StockLocation[]>([]); const [editing, setEditing] = useState<StockLocation | null>(null); const [showForm, setShowForm] = useState(false); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [confirming, setConfirming] = useState<StockLocation | null>(null); const [error, setError] = useState(''); const [success, setSuccess] = useState('');
  const load = useCallback(async () => { setLoading(true); try { setLocations((await api.get<Paginated<StockLocation>>('/stocks?limit=100')).items); setError(''); } catch (caught) { setError(messageFrom(caught)); } finally { setLoading(false); } }, []); useEffect(() => { const timeout = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timeout); }, [load]);
  function open(location: StockLocation | null) { setEditing(location); setShowForm(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  async function save(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); const form = new FormData(event.currentTarget); const payload = { code: form.get('code'), name: form.get('name'), description: form.get('description') || null, kind: form.get('kind') as StockLocationKind, parentId: form.get('parentId') || null }; try { if (editing) await api.patch(`/stocks/${editing.id}`, payload); else await api.post('/stocks', payload); setSuccess(editing ? 'Local atualizado com sucesso.' : 'Local cadastrado com sucesso.'); setShowForm(false); setEditing(null); await load(); } catch (caught) { setError(messageFrom(caught)); } finally { setBusy(false); } }
  async function toggle(location: StockLocation) { setBusy(true); try { await api.patch(`/stocks/${location.id}/status`, { active: !location.active }); setSuccess(location.active ? 'Local inativado com sucesso.' : 'Local ativado com sucesso.'); setConfirming(null); await load(); } catch (caught) { setError(messageFrom(caught)); } finally { setBusy(false); } }
  const parents = locations.filter((item) => item.kind === 'STOCK' && item.active); const kindLabel = (kind: StockLocationKind) => ({ STOCK: 'Estoque', SUBSTOCK: 'Subestoque', EXTERNAL: 'Origem/destino externo' })[kind];
  return <><PageHeader eyebrow="Estrutura logica" title="Estoques e locais" description="Locais usados como origem, destino e classificacao do saldo." action={canWrite && <button onClick={() => open(null)}>+ Novo local</button>} />{success && <Notice kind="success" onClose={() => setSuccess('')}>{success}</Notice>}{error && <Notice kind="error">{error}</Notice>}{showForm && <section className="surface form-panel"><PanelHeading eyebrow={editing ? 'Edicao' : 'Novo cadastro'} title={editing ? 'Editar local' : 'Cadastrar local'} onClose={() => setShowForm(false)} /><form key={editing?.id ?? 'new'} className="form-grid" onSubmit={(event) => void save(event)}><RequiredField label="Codigo"><input name="code" defaultValue={editing?.code} required /></RequiredField><RequiredField label="Nome"><input name="name" defaultValue={editing?.name} required /></RequiredField><RequiredField label="Tipo"><select name="kind" defaultValue={editing?.kind ?? 'STOCK'}><option value="STOCK">Estoque</option><option value="SUBSTOCK">Subestoque</option><option value="EXTERNAL">Origem/destino externo</option></select></RequiredField><label>Estoque pai<select name="parentId" defaultValue={editing?.parentId ?? ''}><option value="">Nenhum</option>{parents.filter((item) => item.id !== editing?.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><small>Obrigatorio somente para subestoques.</small></label><label className="wide">Descricao<input name="description" defaultValue={editing?.description ?? ''} /></label><FormActions busy={busy} saveLabel="Salvar local" onCancel={() => setShowForm(false)} /></form></section>}<section className="surface list-panel">{loading ? <LoadingState label="Carregando locais" /> : locations.length === 0 ? <EmptyState title="Nenhum local cadastrado" description="Cadastre um local para organizar a operacao." action={canWrite ? <button onClick={() => open(null)}>Cadastrar local</button> : undefined} /> : <div className="responsive-table"><table><thead><tr><th>Codigo</th><th>Nome</th><th>Tipo</th><th>Estoque pai</th><th>Status</th><th>Acoes</th></tr></thead><tbody>{locations.map((location) => <tr key={location.id}><td data-label="Codigo"><strong>{location.code}</strong></td><td data-label="Nome">{location.name}</td><td data-label="Tipo">{kindLabel(location.kind)}</td><td data-label="Estoque pai">{locations.find((item) => item.id === location.parentId)?.name ?? '—'}</td><td data-label="Status"><Status active={location.active} /></td><td data-label="Acoes"><div className="row-actions">{canWrite && <><button className="secondary" onClick={() => open(location)}>Editar</button>{canManageStatus && <button className="secondary" onClick={() => location.active ? setConfirming(location) : void toggle(location)}>{location.active ? 'Inativar' : 'Ativar'}</button>}</>}</div></td></tr>)}</tbody></table></div>}</section><ConfirmDialog open={Boolean(confirming)} title="Inativar local?" description={`O local ${confirming?.name ?? ''} deixara de aparecer nas selecoes operacionais.`} confirmLabel="Inativar local" busy={busy} onCancel={() => setConfirming(null)} onConfirm={() => { if (confirming) void toggle(confirming); }} /></>;
}

function MovementsPage({ initialId, success, canCancel }: { initialId?: string; success?: string; canCancel: boolean }) {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [selected, setSelected] = useState<Movement | null>(null);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [filters, setFilters] = useState({ codigoMovimentacao: '', type: '', dateFrom: '', dateTo: '', originLocationId: '', destinationLocationId: '', productId: '', sort: 'RECENT' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancellationTarget, setCancellationTarget] = useState<Movement | null>(null);
  const [cancellationSuccess, setCancellationSuccess] = useState('');
  const label = (type: Movement['type']) => ({
    ENTRADA_EXTERNA: 'Entrada externa',
    SAIDA_EXTERNA: 'Saida externa',
    TRANSFERENCIA_INTERNA: 'Transferencia interna',
    REVISAO: 'Revisao',
  })[type];
  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '100' });
    Object.entries(filters).forEach(([key, value]) => {
      if (!value) return;
      const isDate = key === 'dateFrom' || key === 'dateTo';
      params.set(key, isDate ? new Date(`${value}T${key === 'dateFrom' ? '00:00:00.000' : '23:59:59.999'}`).toISOString() : value);
    });
    try {
      const [movementData, locationData, productData] = await Promise.all([
        api.get<Paginated<Movement>>(`/movements?${params}`),
        api.get<Paginated<StockLocation>>('/stocks?limit=100'),
        api.get<Paginated<Product>>('/products?limit=100'),
      ]);
      setMovements(movementData.items);
      setLocations(locationData.items);
      setProducts(productData.items);
      if (initialId) setSelected(await api.get<Movement>(`/movements/${initialId}`));
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setLoading(false);
    }
  }, [filters, initialId]);
  useEffect(() => { const timeout = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timeout); }, [load]);
  return <>
    <PageHeader eyebrow="Rastreabilidade" title="Movimentações" description="Consulte operações e toque na data para ver os detalhes." />
    {success && <Notice kind="success">{success}</Notice>}
    {cancellationSuccess && <Notice kind="success">{cancellationSuccess}</Notice>}
    {error && <Notice kind="error">{error}</Notice>}
    <FilterPanel count={Object.entries(filters).filter(([key, value]) => value && !(key === 'sort' && value === 'RECENT')).length}><div className="filter-grid">
      <label>Código da movimentação<input type="search" maxLength={30} placeholder="ENT-000153" value={filters.codigoMovimentacao} onChange={(event) => setFilters({ ...filters, codigoMovimentacao: event.target.value })} /></label>
      <label>Tipo<select value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value })}><option value="">Todos</option><option value="ENTRADA_EXTERNA">Entrada externa</option><option value="SAIDA_EXTERNA">Saida externa</option><option value="TRANSFERENCIA_INTERNA">Transferencia interna</option><option value="REVISAO">Revisao</option></select></label>
      <label>De<input type="date" value={filters.dateFrom} onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })} /></label>
      <label>Ate<input type="date" value={filters.dateTo} onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })} /></label>
      <label>Origem<select value={filters.originLocationId} onChange={(event) => setFilters({ ...filters, originLocationId: event.target.value })}><option value="">Todas</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
      <label>Destino<select value={filters.destinationLocationId} onChange={(event) => setFilters({ ...filters, destinationLocationId: event.target.value })}><option value="">Todos</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
      <label>Produto<select value={filters.productId} onChange={(event) => setFilters({ ...filters, productId: event.target.value })}><option value="">Todos</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
      <label>Ordenar por<select value={filters.sort} onChange={(event) => setFilters({ ...filters, sort: event.target.value })}><option value="RECENT">Mais recentes</option><option value="OLDEST">Mais antigas</option><option value="TYPE">Tipo de movimentação</option></select></label>
    </div></FilterPanel>
    <section className="surface list-panel">{loading ? <LoadingState label="Carregando historico" /> : movements.length === 0 ? <EmptyState title="Nenhuma movimentacao encontrada" description="Ajuste os filtros ou registre uma operacao de estoque." /> : <div className="responsive-table"><table><thead><tr><th>Data</th><th>Tipo</th><th>Origem</th><th>Destino</th><th>Itens/quantidade</th></tr></thead><tbody>{movements.map((movement) => <tr key={movement.id} className="clickable-row" tabIndex={0} role="button" onClick={() => setSelected(movement)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(movement); } }}><td data-label="Data">{formatDateTime(movement.occurredAt)}</td><td data-label="Tipo"><strong>{movement.codigoMovimentacao ?? 'Sem código público'}</strong><br />{label(movement.type)}</td><td data-label="Origem">{movement.originLocation.name}</td><td data-label="Destino">{movement.destinationLocation?.name ?? 'Varios destinos'}</td><td data-label="Itens/quantidade">{movement.items.length} / {movement.items.reduce((total, item) => total + item.quantity, 0)}</td></tr>)}</tbody></table></div>}</section>
    {selected && <MovementDetailModal movementId={selected.id} initialMovement={selected} onClose={() => setSelected(null)}>{(movement) => canCancel && !movement.shipmentId && movement.status === 'EFETIVADA' ? <><div className="divider" /><button className="danger button-wide" onClick={() => setCancellationTarget(movement)}>Cancelar movimentação</button></> : null}</MovementDetailModal>}
    {cancellationTarget && <MovementCancellationDialog movement={cancellationTarget} onClose={() => setCancellationTarget(null)} onCanceled={(canceled) => { setMovements((current) => current.map((movement) => movement.id === canceled.id ? canceled : movement)); setSelected(canceled); setCancellationTarget(null); setCancellationSuccess('Movimentacao cancelada e estoque estornado com sucesso.'); }} />}
  </>;
}

function PanelHeading({ eyebrow, title, onClose }: { eyebrow: string; title: string; onClose: () => void }) { return <div className="panel-heading"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div><button type="button" className="secondary" onClick={onClose}>Fechar</button></div>; }
function RequiredField({ label, children }: { label: string; children: ReactNode }) { return <label><span>{label} <span className="required">*</span></span>{children}</label>; }
function FormActions({ busy, saveLabel, onCancel }: { busy: boolean; saveLabel: string; onCancel: () => void }) { return <div className="form-actions"><button disabled={busy}>{busy ? 'Salvando...' : saveLabel}</button><button type="button" className="secondary" onClick={onCancel} disabled={busy}>Cancelar</button></div>; }
function Status({ active }: { active: boolean }) { return <span className={`badge ${active ? 'active' : ''}`}>{active ? 'Ativo' : 'Inativo'}</span>; }
function NavButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) { return <button className={active ? 'current' : ''} onClick={onClick} aria-current={active ? 'page' : undefined}>{children}</button>; }
export function OperationalSectorSwitcher({ value, onChange }: { value: OperationalMode; onChange: (mode: OperationalMode) => void }) {
  return <label className="sector-switcher"><span>Modo operacional</span><select aria-label="Modo operacional" value={value} onChange={(event) => onChange(event.target.value as OperationalMode)}>
    <option value="ADMIN">Admin</option><option value="REVISAO">Revisão</option><option value="PRODUCAO">Produção</option><option value="EXPEDICAO">Expedição</option><option value="PCP">PCP</option>
  </select></label>;
}

export function App() {
  const [user, setUser] = useState<UserSession | null>(null);
  const [operationalMode, setOperationalMode] = useState<OperationalMode>('REVISAO');
  const [checking, setChecking] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [page, setPage] = useState<Page>('home');
  const [selectedMovementId, setSelectedMovementId] = useState<string>();
  const [selectedRecordId, setSelectedRecordId] = useState<string>();
  const [movementSuccess, setMovementSuccess] = useState<string>();
  const [transferPrefill, setTransferPrefill] = useState<TransferPrefill>();
  const [reviewPrefill, setReviewPrefill] = useState<ReviewPrefill>();
  useEffect(() => { void api.refresh().then((result) => {
    const authenticated = result?.user ?? null;
    const sector = authenticated?.sector ?? 'REVISAO';
    const mode = authenticated?.roles.includes('ADMIN') ? 'ADMIN' : sector;
    setUser(authenticated); setOperationalMode(mode);
    api.setOperationalSector(authenticated?.roles.includes('ADMIN') ? mode : null);
  }).finally(() => setChecking(false)); }, []);
  if (checking) return <main className="splash"><span className="spinner" /><p>Preparando seu ambiente...</p></main>;
  if (!user) return <Login onAuthenticated={(authenticated) => {
    const sector = authenticated.sector ?? 'REVISAO';
    const mode = authenticated.roles.includes('ADMIN') ? 'ADMIN' : sector;
    setUser(authenticated); setOperationalMode(mode); setPage('home');
    api.setOperationalSector(authenticated.roles.includes('ADMIN') ? mode : null);
  }} />;
  const isAdmin = user.roles.includes('ADMIN');
  const activeMode: OperationalMode = isAdmin ? operationalMode : user.sector ?? 'REVISAO';
  const activeUser = userForOperationalMode(user, activeMode);
  const activeSector: Sector = activeUser.sector ?? 'REVISAO';
  const adminMode = isAdmin && activeMode === 'ADMIN';
  const can = (permission: string) => activeUser.permissions.includes(permission);
  const navigate: Navigate = (destination) => {
    setSelectedRecordId(undefined);
    if (destination !== 'new-transfer') setTransferPrefill(undefined);
    if (destination !== 'new-review') setReviewPrefill(undefined);
    if (destination === 'shipment-new' && !can('shipments.create')) return;
    setPage(destination);
    window.scrollTo({ top: 0, behavior: 'instant' });
    requestAnimationFrame(() => document.getElementById('main-content')?.focus({ preventScroll: true }));
  };
  const openTransfer = (prefill?: TransferPrefill) => {
    setTransferPrefill(prefill);
    navigate('new-transfer');
  };
  const openReview = (prefill?: ReviewPrefill) => {
    setReviewPrefill(prefill);
    navigate('new-review');
  };
  const openHistory = () => {
    setSelectedMovementId(undefined);
    setMovementSuccess(undefined);
    navigate('history');
  };
  const completeMovement = (id: string, message: string) => {
    setSelectedMovementId(id);
    setMovementSuccess(message);
    navigate('history');
  };
  const logout = () => {
    setLoggingOut(true);
    void api.logout().finally(() => { setUser(null); setLoggingOut(false); });
  };
  const switchSector = (mode: OperationalMode) => {
    api.setOperationalSector(mode); setOperationalMode(mode); setPage('home');
    setSelectedMovementId(undefined); setMovementSuccess(undefined); setTransferPrefill(undefined); setReviewPrefill(undefined);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const switcher = isAdmin && <OperationalSectorSwitcher value={activeMode} onChange={switchSector} />;
  const areas = homeActions(activeUser);
  const menus: Page[] = ['home', 'operations', 'more'];
  const reviewSector = activeSector === 'REVISAO';
  const go: Navigate = (destination) => {
    if (destination === 'new-transfer') openTransfer();
    else if (destination === 'new-review') openReview();
    else if (destination === 'movements' || destination === 'history') openHistory();
    else navigate(destination);
  };
  return <div className="app-shell"><a className="skip-link" href="#main-content">Ir para o conteúdo</a>
    <header className="topbar"><button className="brand" onClick={() => go('home')} aria-label="Ir para o início"><span>ER</span><strong>Estoque Revisão</strong></button><div className="user-area">{switcher}<span className="user-name">{user.username} · {operationalModeLabel[activeMode]}</span><button className="secondary desktop-logout" onClick={logout} disabled={loggingOut}>Sair</button></div></header>
    <aside className="sidebar"><nav aria-label="Navegação principal"><NavButton active={page === 'home'} onClick={() => go('home')}>Início</NavButton>{areas.map((area) => <NavButton key={area.page} active={page === area.page || parentPage(page, activeUser) === area.page} onClick={() => go(area.page)}>{area.title}</NavButton>)}<NavButton active={page === 'more' || page === 'users' || page === 'settings'} onClick={() => go('more')}>Menu e conta</NavButton></nav><p className="sidebar-note">{operationalModeLabel[activeMode]}</p></aside>
    <main className="workspace" id="main-content" tabIndex={-1}>
      <NavigationTrail page={page} user={activeUser} navigate={go} />
      {page === 'home' && <OperationalHomePage key={activeMode} user={activeUser} navigate={go} onOpenRecord={(destination, id) => { navigate(destination === 'movements' ? 'history' : destination); setSelectedRecordId(id); setSelectedMovementId(id); setMovementSuccess(undefined); }} />}
      {page !== 'home' && menus.includes(page) && <SectionMenu page={page} user={activeUser} navigate={go} />}
      {page === 'more' && <section className="surface account-card"><h2>{user.username}</h2><p className="muted">{operationalModeLabel[activeMode]}</p><button className="secondary" onClick={logout} disabled={loggingOut}>{loggingOut ? 'Saindo…' : 'Sair do sistema'}</button></section>}
      {page === 'users' && adminMode && <UsersPage currentUserId={user.id} onOwnUpdate={logout} />}
      {page === 'settings' && adminMode && <SettingsPage />}
      {activeSector !== 'PCP' && ['shipments', 'shipment-new', 'shipment-sent'].includes(page) && can('shipments.read') && <ShipmentsPage key={`${activeSector}:${page}`} user={activeUser} initialId={selectedRecordId} initialView={page === 'shipment-sent' ? 'sent' : 'pending'} initialCreating={page === 'shipment-new'} onHistory={() => go('history')} />}
      {activeSector === 'PCP' && ['pcp', 'pcp-all', 'pcp-executed'].includes(page) && can('pcp.movements.read') && <PcpPage key={page} initialId={selectedRecordId} initialStatus={page === 'pcp-all' ? '' : page === 'pcp-executed' ? 'EXECUTADA' : 'PENDENTE'} />}
      {reviewSector && <>
        {page === 'new-entry' && adminMode && can('movements.create') && <ExternalEntryPage onCreated={(id) => completeMovement(id, 'Entrada registrada com sucesso.')} />}
        {page === 'new-exit' && adminMode && can('movements.create') && <ExternalExitPage onCreated={(id) => completeMovement(id, 'Saida registrada com sucesso.')} />}
        {page === 'new-transfer' && can('movements.create') && <InternalTransferPage prefill={transferPrefill} onCreated={(id) => completeMovement(id, 'Transferencia realizada com sucesso.')} />}
        {page === 'new-review' && can('movements.create') && <ReviewPage prefill={reviewPrefill} onCreated={(id) => completeMovement(id, 'Revisao realizada com sucesso.')} />}
        {page === 'movements' && can('movements.read') && <MovementsPage initialId={selectedMovementId} success={movementSuccess} canCancel={adminMode && can('movements.cancel')} />}
        {page === 'stocks' && can('stocks.read') && <StocksPage canManageStatus={adminMode} canWrite={can('stocks.create') || can('stocks.update')} />}
        {page === 'inventory' && can('stock-positions.read') && <StockReportsPage />}
        {page === 'reports' && can('movements.read') && <ReportsPage onReviews={() => navigate('reports-reviews')} onStock={can('stock-positions.read') ? () => navigate('inventory') : undefined} />}
        {page === 'reports-reviews' && can('movements.read') && <ReviewReportsPage onMovements={() => navigate('reports')} onStock={can('stock-positions.read') ? () => navigate('inventory') : undefined} />}
      </>}
      {page === 'products' && can('products.read') && <ProductsPage canManageStatus={adminMode} canReadConversions={can('product-conversions.read')} canWrite={can('products.create') || can('products.update')} />}
      {page === 'inventory' && activeSector === 'PCP' && can('stock-positions.read') && <StockReportsPage />}
      {page === 'history' && (can('movements.read') || can('pcp.movements.read') || can('shipments.read')) && <HistoryPage user={activeUser} initialMovementId={selectedMovementId} success={movementSuccess} onOpenShipment={(id) => { setSelectedRecordId(id); navigate('shipments'); }} onOpenPcp={(id) => { setSelectedRecordId(id); navigate('pcp'); }} />}
    </main>
    <nav className="bottom-nav" aria-label="Navegação principal mobile">
      <NavButton active={page === 'home'} onClick={() => go('home')}>Início</NavButton>
      {areas.slice(0, 2).map((area) => <NavButton key={area.page} active={page === area.page || parentPage(page, activeUser) === area.page} onClick={() => go(area.page)}>{area.title}</NavButton>)}
      <NavButton active={page === 'more' || page === 'users' || page === 'settings'} onClick={() => go('more')}>Menu</NavButton>
    </nav>
  </div>;
}
