import { FormEvent, ReactNode, useCallback, useEffect, useState } from 'react';
import { api, Batch, Movement, Paginated, Product, StockLocation, StockLocationKind, StockPosition, UnitConversion, UserSession } from './api';
import { ConfirmDialog, EmptyState, FilterPanel, LoadingState, Notice, PageHeader } from './components';
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
import { ShipmentsPage, ShipmentHomeNotice } from './ShipmentsPage';
import { OperationalHomePage } from './OperationalHomePage';
import { Sector, sectorLabel } from './shipments';

type Page = 'shipments' | 'home' | 'operations' | 'new-entry' | 'new-exit' | 'new-transfer' | 'new-review' | 'movements' | 'inventory' | 'reports' | 'reports-reviews' | 'reports-stock' | 'products' | 'stocks' | 'more';
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

function HomePage({ navigate, onTransfer, onReview, inventory, movementsCreate, movementsRead }: { navigate: Navigate; onTransfer: () => void; onReview: () => void; inventory: boolean; movementsCreate: boolean; movementsRead: boolean }) {
  return <OperationalHomePage inventory={inventory} movementsCreate={movementsCreate} movementsRead={movementsRead} onEntry={() => navigate('new-entry')} onExit={() => navigate('new-exit')} onReview={onReview} onTransfer={onTransfer} onInventory={() => navigate('reports-stock')} onHistory={() => navigate('movements')} />;
}

function OperationsPage({ navigate, onTransfer, onReview }: { navigate: Navigate; onTransfer: () => void; onReview: () => void }) {
  return <><PageHeader eyebrow="Movimentacao" title="Operacoes de estoque" description="Escolha a movimentacao que deseja registrar." /><section className="quick-actions"><button className="quick-action primary-action" onClick={onReview}><span>Revisar</span><small>Distribua os produtos que possuem saldo em Revisar</small></button><button className="quick-action" onClick={() => navigate('new-entry')}><span>Entrada</span><small>Receba produtos de uma origem externa</small></button><button className="quick-action" onClick={() => navigate('new-exit')}><span>Saída</span><small>Envie produtos disponiveis para um destino externo</small></button><button className="quick-action" onClick={onTransfer}><span>Transferir</span><small>Mova saldo entre dois locais controlados</small></button></section></>;
}

function ProductsPage({ canWrite }: { canWrite: boolean }) {
  const [products, setProducts] = useState<Product[]>([]); const [selected, setSelected] = useState<Product | null>(null); const [conversions, setConversions] = useState<UnitConversion[]>([]);
  const [search, setSearch] = useState(''); const [error, setError] = useState(''); const [success, setSuccess] = useState(''); const [editing, setEditing] = useState<Product | null>(null);
  const [showForm, setShowForm] = useState(false); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [confirming, setConfirming] = useState<Product | null>(null);
  const load = useCallback(async () => { setLoading(true); try { setProducts((await api.get<Paginated<Product>>(`/products?limit=100&search=${encodeURIComponent(search)}`)).items); setError(''); } catch (caught) { setError(messageFrom(caught)); } finally { setLoading(false); } }, [search]);
  useEffect(() => { const timeout = window.setTimeout(() => void load(), 250); return () => window.clearTimeout(timeout); }, [load]);
  function openForm(product: Product | null) { setEditing(product); setShowForm(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  async function save(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); const form = new FormData(event.currentTarget); try { const payload = { code: form.get('code'), name: form.get('name'), defaultUnit: form.get('defaultUnit'), shelfLifeYears: Number(form.get('shelfLifeYears')) }; if (editing) await api.patch(`/products/${editing.id}`, payload); else await api.post('/products', payload); setSuccess(editing ? 'Produto atualizado com sucesso.' : 'Produto cadastrado com sucesso.'); setShowForm(false); setEditing(null); await load(); } catch (caught) { setError(messageFrom(caught)); } finally { setBusy(false); } }
  async function select(product: Product) { setSelected(product); revealDetails(); try { setConversions(await api.get(`/products/${product.id}/conversions`)); } catch (caught) { setError(messageFrom(caught)); } }
  async function addConversion(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!selected) return; setBusy(true); const form = new FormData(event.currentTarget); try { await api.post(`/products/${selected.id}/conversions`, { fromUnit: form.get('fromUnit'), toUnit: form.get('toUnit'), factor: Number(form.get('factor')) }); setConversions(await api.get(`/products/${selected.id}/conversions`)); event.currentTarget.reset(); setSuccess('Conversao adicionada com sucesso.'); } catch (caught) { setError(messageFrom(caught)); } finally { setBusy(false); } }
  async function toggle(product: Product) { setBusy(true); try { await api.patch(`/products/${product.id}/status`, { active: !product.active }); setSuccess(product.active ? 'Produto inativado com sucesso.' : 'Produto ativado com sucesso.'); setConfirming(null); await load(); } catch (caught) { setError(messageFrom(caught)); } finally { setBusy(false); } }
  return <><PageHeader eyebrow="Cadastro base" title="Produtos" description="Consulte produtos e mantenha suas unidades e conversoes." action={canWrite && <button onClick={() => openForm(null)}>+ Novo produto</button>} />{success && <Notice kind="success" onClose={() => setSuccess('')}>{success}</Notice>}{error && <Notice kind="error" onClose={() => setError('')}>{error}</Notice>}{showForm && <section className="surface form-panel"><PanelHeading eyebrow={editing ? 'Edicao' : 'Novo cadastro'} title={editing ? 'Editar produto' : 'Cadastrar produto'} onClose={() => setShowForm(false)} /><form key={editing?.id ?? 'new'} className="form-grid" onSubmit={(event) => void save(event)}><RequiredField label="Codigo"><input name="code" defaultValue={editing?.code} required maxLength={60} autoFocus /></RequiredField><RequiredField label="Descrição"><input name="name" defaultValue={editing?.name} required maxLength={200} /></RequiredField><RequiredField label="Tipo de unidade"><input name="defaultUnit" defaultValue={editing?.defaultUnit} required maxLength={20} /></RequiredField><RequiredField label="Prazo padrão de validade (anos)"><input name="shelfLifeYears" type="number" min="1" step="1" defaultValue={editing?.shelfLifeYears ?? ''} required /><small>Usado para sugerir a validade de novas movimentações. Não altera o histórico.</small></RequiredField><FormActions busy={busy} saveLabel="Salvar produto" onCancel={() => setShowForm(false)} /></form></section>}<div className="content-grid"><section className="surface list-panel"><div className="toolbar"><label className="search-field">Buscar produto<input type="search" placeholder="Codigo ou nome" value={search} onChange={(event) => setSearch(event.target.value)} /></label></div>{loading ? <LoadingState label="Carregando produtos" /> : products.length === 0 ? <EmptyState title={search ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado'} description={search ? 'Revise o termo de busca.' : 'Cadastre o primeiro produto para comecar.'} action={canWrite && !search ? <button onClick={() => openForm(null)}>Cadastrar produto</button> : undefined} /> : <div className="responsive-table"><table><thead><tr><th>Codigo</th><th>Produto</th><th>Unidade</th><th>Status</th><th>Acoes</th></tr></thead><tbody>{products.map((product) => <tr key={product.id} className={selected?.id === product.id ? 'selected' : ''}><td data-label="Codigo"><button className="text-button" onClick={() => void select(product)}>{product.code}</button></td><td data-label="Produto">{product.name}</td><td data-label="Unidade">{product.defaultUnit}</td><td data-label="Status"><Status active={product.active} /></td><td data-label="Acoes"><div className="row-actions">{canWrite && <><button className="secondary" onClick={() => openForm(product)}>Editar</button><button className="secondary" onClick={() => product.active ? setConfirming(product) : void toggle(product)}>{product.active ? 'Inativar' : 'Ativar'}</button></>}</div></td></tr>)}</tbody></table></div>}</section><aside className="surface detail-panel" tabIndex={-1}><p className="eyebrow">Detalhes</p><h2>{selected?.name ?? 'Selecione um produto'}</h2>{selected ? <><dl><dt>Codigo</dt><dd>{selected.code}</dd><dt>Unidade</dt><dd>{selected.defaultUnit}</dd><dt>Prazo padrão</dt><dd>{selected.shelfLifeYears ? `${selected.shelfLifeYears} ano(s)` : 'Ainda não informado'}</dd><dt>Status</dt><dd>{selected.active ? 'Ativo' : 'Inativo'}</dd></dl><div className="divider" /><h3>Conversoes de unidade</h3>{conversions.length === 0 ? <p className="muted">Nenhuma conversao cadastrada.</p> : <ul className="conversion-list">{conversions.map((item) => <li key={item.id}><strong>{item.fromUnit}</strong><span>1 × {item.factor} = {item.factor} {item.toUnit}</span></li>)}</ul>}{canWrite && <form className="compact-form" onSubmit={(event) => void addConversion(event)}><label>Origem<input name="fromUnit" required /></label><label>Destino<input name="toUnit" required /></label><label>Fator<input name="factor" type="number" min="0.000001" step="0.000001" required /></label><button disabled={busy}>{busy ? 'Adicionando...' : 'Adicionar conversao'}</button></form>}</> : <p className="muted">Toque no codigo de um produto para ver os detalhes.</p>}</aside></div><ConfirmDialog open={Boolean(confirming)} title="Inativar produto?" description={`O produto ${confirming?.name ?? ''} deixara de aparecer nas selecoes operacionais.`} confirmLabel="Inativar produto" busy={busy} onCancel={() => setConfirming(null)} onConfirm={() => { if (confirming) void toggle(confirming); }} /></>;
}

function InventoryPage({ onTransfer, onReview }: { onTransfer?: (prefill: TransferPrefill) => void; onReview?: (prefill: ReviewPrefill) => void }) {
  const [positions, setPositions] = useState<StockPosition[]>([]); const [products, setProducts] = useState<Product[]>([]); const [batches, setBatches] = useState<Batch[]>([]); const [locations, setLocations] = useState<StockLocation[]>([]); const [selected, setSelected] = useState<StockPosition | null>(null);
  const [productId, setProductId] = useState(''); const [batchId, setBatchId] = useState(''); const [stockLocationId, setStockLocationId] = useState(''); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const load = useCallback(async () => { setLoading(true); const query = new URLSearchParams({ limit: '100' }); if (productId) query.set('productId', productId); if (batchId) query.set('batchId', batchId); if (stockLocationId) query.set('stockLocationId', stockLocationId); try { const [positionData, productData, batchData, locationData] = await Promise.all([api.get<Paginated<StockPosition>>(`/stock-positions?${query}`), api.get<Paginated<Product>>('/products?limit=100&active=true'), api.get<Paginated<Batch>>('/batches?limit=100'), api.get<Paginated<StockLocation>>('/stocks?limit=100&active=true')]); setPositions(positionData.items); setProducts(productData.items); setBatches(batchData.items); setLocations(locationData.items); setError(''); } catch (caught) { setError(messageFrom(caught)); } finally { setLoading(false); } }, [batchId, productId, stockLocationId]);
  useEffect(() => { const timeout = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timeout); }, [load]);
  const filters = [productId, batchId, stockLocationId].filter(Boolean).length; const availableBatches = productId ? batches.filter((batch) => batch.productId === productId) : batches; const clear = () => { setProductId(''); setBatchId(''); setStockLocationId(''); };
  return <><PageHeader eyebrow="Consulta operacional" title="Estoque atual" description="Saldo disponível separado por produto, lote, validade e local. Quantidades em trânsito ficam em Envios." />{error && <Notice kind="error">{error}</Notice>}<FilterPanel count={filters}><div className="filter-grid"><label>Produto<select value={productId} onChange={(event) => { setProductId(event.target.value); setBatchId(''); }}><option value="">Todos</option>{products.map((product) => <option key={product.id} value={product.id}>{product.code} — {product.name}</option>)}</select></label><label>Lote<select value={batchId} onChange={(event) => setBatchId(event.target.value)}><option value="">Todos</option>{availableBatches.map((batch) => <option key={batch.id} value={batch.id}>{batch.code} — validade {formatDate(batch.expirationDate)}</option>)}</select></label><label>Local<select value={stockLocationId} onChange={(event) => setStockLocationId(event.target.value)}><option value="">Todos</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.code} — {location.name}</option>)}</select></label></div>{filters > 0 && <button className="text-button" onClick={clear}>Limpar filtros</button>}</FilterPanel><div className="content-grid inventory-grid"><section className="surface list-panel">{loading ? <LoadingState label="Consultando estoque" /> : positions.length === 0 ? <EmptyState title={filters ? 'Nenhuma posicao encontrada' : 'Estoque sem posicoes'} description={filters ? 'Ajuste ou limpe os filtros.' : 'As posicoes aparecerao quando operacoes de estoque forem registradas.'} action={filters ? <button className="secondary" onClick={clear}>Limpar filtros</button> : undefined} /> : <div className="responsive-table"><table><thead><tr><th>Produto</th><th>Lote</th><th>Fabricacao</th><th>Validade</th><th>Local</th><th>Quantidade</th></tr></thead><tbody>{positions.map((position) => <tr key={position.id} className={selected?.id === position.id ? 'selected' : ''} onClick={() => { setSelected(position); revealDetails(); }} tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(position); revealDetails(); } }}><td data-label="Produto"><strong>{position.product.name}</strong><small className="cell-note">{position.product.code}</small></td><td data-label="Lote">{position.batch.code}</td><td data-label="Fabricacao">{formatDate(position.batch.manufacturingDate)}</td><td data-label="Validade">{formatDate(position.batch.expirationDate)}</td><td data-label="Local">{position.stockLocation.name}</td><td data-label="Quantidade"><strong className="quantity">{position.quantity} {position.product.defaultUnit}</strong></td></tr>)}</tbody></table></div>}</section>{selected && <aside className="surface detail-panel" tabIndex={-1}><PanelHeading eyebrow="Detalhes da posicao" title={selected.product.name} onClose={() => setSelected(null)} /><dl><dt>Produto</dt><dd>{selected.product.code}</dd><dt>Lote</dt><dd>{selected.batch.code}</dd><dt>Fabricacao</dt><dd>{formatDate(selected.batch.manufacturingDate)}</dd><dt>Validade</dt><dd>{formatDate(selected.batch.expirationDate)}</dd><dt>Local</dt><dd>{selected.stockLocation.name}</dd><dt>Quantidade</dt><dd>{selected.quantity} {selected.product.defaultUnit}</dd></dl>{onReview && selected.stockLocation.reviewRole === 'SOURCE' && <button className="button-wide" onClick={() => onReview({ productId: selected.productId, batchId: selected.batchId })}>Realizar revisao</button>}{onTransfer && <button className="button-wide secondary" onClick={() => onTransfer({ originLocationId: selected.stockLocationId, productId: selected.productId, batchId: selected.batchId })}>Transferir esta posicao</button>}</aside>}</div></>;
}

function StocksPage({ canWrite }: { canWrite: boolean }) {
  const [locations, setLocations] = useState<StockLocation[]>([]); const [editing, setEditing] = useState<StockLocation | null>(null); const [showForm, setShowForm] = useState(false); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [confirming, setConfirming] = useState<StockLocation | null>(null); const [error, setError] = useState(''); const [success, setSuccess] = useState('');
  const load = useCallback(async () => { setLoading(true); try { setLocations((await api.get<Paginated<StockLocation>>('/stocks?limit=100')).items); setError(''); } catch (caught) { setError(messageFrom(caught)); } finally { setLoading(false); } }, []); useEffect(() => { const timeout = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timeout); }, [load]);
  function open(location: StockLocation | null) { setEditing(location); setShowForm(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  async function save(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); const form = new FormData(event.currentTarget); const payload = { code: form.get('code'), name: form.get('name'), description: form.get('description') || null, kind: form.get('kind') as StockLocationKind, parentId: form.get('parentId') || null }; try { if (editing) await api.patch(`/stocks/${editing.id}`, payload); else await api.post('/stocks', payload); setSuccess(editing ? 'Local atualizado com sucesso.' : 'Local cadastrado com sucesso.'); setShowForm(false); setEditing(null); await load(); } catch (caught) { setError(messageFrom(caught)); } finally { setBusy(false); } }
  async function toggle(location: StockLocation) { setBusy(true); try { await api.patch(`/stocks/${location.id}/status`, { active: !location.active }); setSuccess(location.active ? 'Local inativado com sucesso.' : 'Local ativado com sucesso.'); setConfirming(null); await load(); } catch (caught) { setError(messageFrom(caught)); } finally { setBusy(false); } }
  const parents = locations.filter((item) => item.kind === 'STOCK' && item.active); const kindLabel = (kind: StockLocationKind) => ({ STOCK: 'Estoque', SUBSTOCK: 'Subestoque', EXTERNAL: 'Origem/destino externo' })[kind];
  return <><PageHeader eyebrow="Estrutura logica" title="Estoques e locais" description="Locais usados como origem, destino e classificacao do saldo." action={canWrite && <button onClick={() => open(null)}>+ Novo local</button>} />{success && <Notice kind="success" onClose={() => setSuccess('')}>{success}</Notice>}{error && <Notice kind="error">{error}</Notice>}{showForm && <section className="surface form-panel"><PanelHeading eyebrow={editing ? 'Edicao' : 'Novo cadastro'} title={editing ? 'Editar local' : 'Cadastrar local'} onClose={() => setShowForm(false)} /><form key={editing?.id ?? 'new'} className="form-grid" onSubmit={(event) => void save(event)}><RequiredField label="Codigo"><input name="code" defaultValue={editing?.code} required /></RequiredField><RequiredField label="Nome"><input name="name" defaultValue={editing?.name} required /></RequiredField><RequiredField label="Tipo"><select name="kind" defaultValue={editing?.kind ?? 'STOCK'}><option value="STOCK">Estoque</option><option value="SUBSTOCK">Subestoque</option><option value="EXTERNAL">Origem/destino externo</option></select></RequiredField><label>Estoque pai<select name="parentId" defaultValue={editing?.parentId ?? ''}><option value="">Nenhum</option>{parents.filter((item) => item.id !== editing?.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><small>Obrigatorio somente para subestoques.</small></label><label className="wide">Descricao<input name="description" defaultValue={editing?.description ?? ''} /></label><FormActions busy={busy} saveLabel="Salvar local" onCancel={() => setShowForm(false)} /></form></section>}<section className="surface list-panel">{loading ? <LoadingState label="Carregando locais" /> : locations.length === 0 ? <EmptyState title="Nenhum local cadastrado" description="Cadastre um local para organizar a operacao." action={canWrite ? <button onClick={() => open(null)}>Cadastrar local</button> : undefined} /> : <div className="responsive-table"><table><thead><tr><th>Codigo</th><th>Nome</th><th>Tipo</th><th>Estoque pai</th><th>Status</th><th>Acoes</th></tr></thead><tbody>{locations.map((location) => <tr key={location.id}><td data-label="Codigo"><strong>{location.code}</strong></td><td data-label="Nome">{location.name}</td><td data-label="Tipo">{kindLabel(location.kind)}</td><td data-label="Estoque pai">{locations.find((item) => item.id === location.parentId)?.name ?? '—'}</td><td data-label="Status"><Status active={location.active} /></td><td data-label="Acoes"><div className="row-actions">{canWrite && <><button className="secondary" onClick={() => open(location)}>Editar</button><button className="secondary" onClick={() => location.active ? setConfirming(location) : void toggle(location)}>{location.active ? 'Inativar' : 'Ativar'}</button></>}</div></td></tr>)}</tbody></table></div>}</section><ConfirmDialog open={Boolean(confirming)} title="Inativar local?" description={`O local ${confirming?.name ?? ''} deixara de aparecer nas selecoes operacionais.`} confirmLabel="Inativar local" busy={busy} onCancel={() => setConfirming(null)} onConfirm={() => { if (confirming) void toggle(confirming); }} /></>;
}

function MovementsPage({ initialId, success, canCancel }: { initialId?: string; success?: string; canCancel: boolean }) {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [selected, setSelected] = useState<Movement | null>(null);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [filters, setFilters] = useState({ type: '', dateFrom: '', dateTo: '', originLocationId: '', destinationLocationId: '', productId: '' });
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
    <FilterPanel count={Object.values(filters).filter(Boolean).length}><div className="filter-grid">
      <label>Tipo<select value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value })}><option value="">Todos</option><option value="ENTRADA_EXTERNA">Entrada externa</option><option value="SAIDA_EXTERNA">Saida externa</option><option value="TRANSFERENCIA_INTERNA">Transferencia interna</option><option value="REVISAO">Revisao</option></select></label>
      <label>De<input type="date" value={filters.dateFrom} onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })} /></label>
      <label>Ate<input type="date" value={filters.dateTo} onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })} /></label>
      <label>Origem<select value={filters.originLocationId} onChange={(event) => setFilters({ ...filters, originLocationId: event.target.value })}><option value="">Todas</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
      <label>Destino<select value={filters.destinationLocationId} onChange={(event) => setFilters({ ...filters, destinationLocationId: event.target.value })}><option value="">Todos</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
      <label>Produto<select value={filters.productId} onChange={(event) => setFilters({ ...filters, productId: event.target.value })}><option value="">Todos</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
    </div></FilterPanel>
    <div className="content-grid"><section className="surface list-panel">{loading ? <LoadingState label="Carregando historico" /> : movements.length === 0 ? <EmptyState title="Nenhuma movimentacao encontrada" description="Ajuste os filtros ou registre uma operacao de estoque." /> : <div className="responsive-table"><table><thead><tr><th>Data</th><th>Tipo</th><th>Origem</th><th>Destino</th><th>Itens/quantidade</th></tr></thead><tbody>{movements.map((movement) => <tr key={movement.id} className={selected?.id === movement.id ? 'selected' : ''}><td data-label="Data"><button className="text-button" onClick={() => { setSelected(movement); revealDetails(); }}>{formatDateTime(movement.occurredAt)}</button></td><td data-label="Tipo">{label(movement.type)}</td><td data-label="Origem">{movement.originLocation.name}</td><td data-label="Destino">{movement.destinationLocation?.name ?? 'Varios destinos'}</td><td data-label="Itens/quantidade">{movement.items.length} / {movement.items.reduce((total, item) => total + item.quantity, 0)}</td></tr>)}</tbody></table></div>}</section>
      <aside className="surface detail-panel" tabIndex={-1}><p className="eyebrow">Detalhe imutavel</p><h2>{selected ? label(selected.type) : 'Selecione uma movimentacao'}</h2>{selected && <><dl><dt>Identificador</dt><dd>{selected.id}</dd><dt>Status</dt><dd><span className={`badge ${selected.status === 'EFETIVADA' ? 'active' : 'canceled'}`}>{selected.status === 'EFETIVADA' ? 'Efetivada' : 'Cancelada'}</span></dd><dt>Data/hora</dt><dd>{formatDateTime(selected.occurredAt)}</dd><dt>Responsavel</dt><dd>{selected.responsibleUser.username}</dd><dt>Origem</dt><dd>{selected.originLocation.name}</dd><dt>Destino</dt><dd>{selected.destinationLocation?.name ?? 'Distribuicao da revisao'}</dd><dt>Total de itens</dt><dd>{selected.items.length}</dd><dt>Quantidade total</dt><dd>{selected.items.reduce((total, item) => total + item.quantity, 0)}</dd><dt>Observacao</dt><dd>{selected.observation || '-'}</dd>{selected.status === 'CANCELADA' && <><dt>Cancelada em</dt><dd>{selected.canceledAt ? formatDateTime(selected.canceledAt) : '-'}</dd><dt>Cancelada por</dt><dd>{selected.canceledByUser?.username ?? '-'}</dd><dt>Motivo</dt><dd>{selected.cancellationReason}</dd></>}</dl><div className="divider" /><h3>Itens</h3><ul className="movement-detail-items">{selected.items.map((item) => <li key={item.id}><strong>{(item.productSnapshot ?? item.product).code} - {(item.productSnapshot ?? item.product).name}</strong>{selected.type === 'TRANSFERENCIA_INTERNA' ? <><span>Origem: lote {item.batch.code} / fabricação {formatDate(item.batch.manufacturingDate)} / validade {formatDate(item.batch.expirationDate)} / {selected.originLocation.name}</span><span>Destino: lote {item.destinationBatch?.code} / fabricação {formatDate(item.destinationBatch?.manufacturingDate ?? '')} / validade {formatDate(item.destinationBatch?.expirationDate ?? '')} / {selected.destinationLocation?.name}</span></> : <><span>Lote {item.batch.code}</span><span>Fabricacao {formatDate(item.batch.manufacturingDate)} - validade {formatDate(item.batch.expirationDate)}</span></>}<b>{item.quantity} {(item.productSnapshot ?? item.product).defaultUnit}</b>{item.distributions?.length > 0 && <ul className="distribution-detail">{item.distributions.map((distribution) => <li key={distribution.id}>{distribution.destinationLocation.name}: <strong>{distribution.quantity} {(item.productSnapshot ?? item.product).defaultUnit}</strong></li>)}</ul>}</li>)}</ul>{canCancel && !selected.shipmentId && selected.status === 'EFETIVADA' && <><div className="divider" /><button className="danger button-wide" onClick={() => setCancellationTarget(selected)}>Cancelar movimentacao</button></>}</>}</aside>
    </div>
    {cancellationTarget && <MovementCancellationDialog movement={cancellationTarget} onClose={() => setCancellationTarget(null)} onCanceled={(canceled) => { setMovements((current) => current.map((movement) => movement.id === canceled.id ? canceled : movement)); setSelected(canceled); setCancellationTarget(null); setCancellationSuccess('Movimentacao cancelada e estoque estornado com sucesso.'); }} />}
  </>;
}

function PanelHeading({ eyebrow, title, onClose }: { eyebrow: string; title: string; onClose: () => void }) { return <div className="panel-heading"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div><button type="button" className="secondary" onClick={onClose}>Fechar</button></div>; }
function RequiredField({ label, children }: { label: string; children: ReactNode }) { return <label><span>{label} <span className="required">*</span></span>{children}</label>; }
function FormActions({ busy, saveLabel, onCancel }: { busy: boolean; saveLabel: string; onCancel: () => void }) { return <div className="form-actions"><button disabled={busy}>{busy ? 'Salvando...' : saveLabel}</button><button type="button" className="secondary" onClick={onCancel} disabled={busy}>Cancelar</button></div>; }
function Status({ active }: { active: boolean }) { return <span className={`badge ${active ? 'active' : ''}`}>{active ? 'Ativo' : 'Inativo'}</span>; }
function MorePage({ navigate, username, logout, busy, reportsPage, onHistory }: { onHistory?: () => void; navigate: Navigate; username: string; logout: () => void; busy: boolean; reportsPage?: Page }) { return <><PageHeader eyebrow="Menu" title="Consultas e cadastros" description="Acesse os registros, cadastros e sua conta." /><section className="more-grid">{onHistory && <button className="menu-card" onClick={onHistory}><span>Movimentações</span><small>Consultar operações e cancelamentos</small></button>}{reportsPage && <button className="menu-card" onClick={() => navigate(reportsPage)}><span>Relatórios</span><small>Movimentacoes, revisoes e validades</small></button>}<button className="menu-card" onClick={() => navigate('products')}><span>Produtos</span><small>Cadastro e conversoes de unidade</small></button><button className="menu-card" onClick={() => navigate('stocks')}><span>Estoques e locais</span><small>Estrutura logica da operacao</small></button><article className="surface account-card"><p className="eyebrow">Sessao atual</p><h2>{username}</h2><p className="muted">Seu acesso segue as permissoes do perfil.</p><button className="secondary button-wide" onClick={logout} disabled={busy}>{busy ? 'Saindo...' : 'Sair do sistema'}</button></article></section></>; }
function NavButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) { return <button className={active ? 'current' : ''} onClick={onClick} aria-current={active ? 'page' : undefined}>{children}</button>; }
export function OperationalSectorSwitcher({ value, onChange }: { value: Sector; onChange: (sector: Sector) => void }) {
  return <label className="sector-switcher"><span>Modo operacional</span><select aria-label="Modo operacional" value={value} onChange={(event) => onChange(event.target.value as Sector)}>
    <option value="REVISAO">Revisão</option><option value="PRODUCAO">Produção</option><option value="EXPEDICAO">Expedição</option>
  </select></label>;
}

export function App() {
  const [user, setUser] = useState<UserSession | null>(null);
  const [operationalSector, setOperationalSector] = useState<Sector>('REVISAO');
  const [checking, setChecking] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [page, setPage] = useState<Page>('home');
  const [selectedMovementId, setSelectedMovementId] = useState<string>();
  const [movementSuccess, setMovementSuccess] = useState<string>();
  const [transferPrefill, setTransferPrefill] = useState<TransferPrefill>();
  const [reviewPrefill, setReviewPrefill] = useState<ReviewPrefill>();
  useEffect(() => { void api.refresh().then((result) => {
    const authenticated = result?.user ?? null;
    const sector = authenticated?.sector ?? 'REVISAO';
    setUser(authenticated); setOperationalSector(sector);
    api.setOperationalSector(authenticated?.roles.includes('ADMIN') ? sector : null);
  }).finally(() => setChecking(false)); }, []);
  if (checking) return <main className="splash"><span className="spinner" /><p>Preparando seu ambiente...</p></main>;
  if (!user) return <Login onAuthenticated={(authenticated) => {
    const sector = authenticated.sector ?? 'REVISAO';
    setUser(authenticated); setOperationalSector(sector); setPage('home');
    api.setOperationalSector(authenticated.roles.includes('ADMIN') ? sector : null);
  }} />;
  const isAdmin = user.roles.includes('ADMIN');
  const activeSector = isAdmin ? operationalSector : user.sector ?? 'REVISAO';
  const activeUser: UserSession = activeSector === user.sector ? user : { ...user, sector: activeSector };
  const can = (permission: string) => user.permissions.includes(permission);
  const reportsStart: Page | undefined = can('movements.read')
    ? 'reports'
    : can('stock-positions.read') ? 'reports-stock' : undefined;
  const navigate: Navigate = (destination) => {
    if (destination !== 'new-transfer') setTransferPrefill(undefined);
    if (destination !== 'new-review') setReviewPrefill(undefined);
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
    navigate('movements');
  };
  const completeMovement = (id: string, message: string) => {
    setSelectedMovementId(id);
    setMovementSuccess(message);
    navigate('movements');
  };
  const logout = () => {
    setLoggingOut(true);
    void api.logout().finally(() => { setUser(null); setLoggingOut(false); });
  };
  const switchSector = (sector: Sector) => {
    api.setOperationalSector(sector); setOperationalSector(sector); setPage('home');
    setSelectedMovementId(undefined); setMovementSuccess(undefined); setTransferPrefill(undefined); setReviewPrefill(undefined);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const switcher = isAdmin && <OperationalSectorSwitcher value={activeSector} onChange={switchSector} />;
  if (activeSector !== 'REVISAO') return <div className="sector-portal"><header className="topbar"><strong>ER · {user.username} · {sectorLabel[activeSector]}</strong><div className="user-area">{switcher}<button className="secondary" onClick={logout} disabled={loggingOut}>Sair</button></div></header><main className="sector-workspace">{can('shipments.read') && <ShipmentsPage key={activeSector} user={activeUser} />}</main></div>;
  return <div className="app-shell"><a className="skip-link" href="#main-content">Ir para o conteúdo</a>
    <header className="topbar"><button className="brand" onClick={() => navigate('home')} aria-label="Ir para o inicio"><span>ER</span><strong>Estoque Revisao</strong></button><div className="user-area">{switcher}<span className="user-name">{user.username}</span><button className="secondary desktop-logout" onClick={logout}>Sair</button></div></header>
    <aside className="sidebar"><nav aria-label="Navegacao principal">{can('shipments.read') && <NavButton active={page === 'shipments'} onClick={() => navigate('shipments')}>Envios entre setores</NavButton>}<NavButton active={page === 'home'} onClick={() => navigate('home')}>Início</NavButton>{can('movements.create') && <><NavButton active={page === 'new-review'} onClick={() => openReview()}>Revisar</NavButton><NavButton active={page === 'new-entry'} onClick={() => navigate('new-entry')}>Entrada</NavButton><NavButton active={page === 'new-exit'} onClick={() => navigate('new-exit')}>Saída</NavButton><NavButton active={page === 'new-transfer'} onClick={() => openTransfer()}>Transferir</NavButton></>}{can('movements.read') && <NavButton active={page === 'movements'} onClick={openHistory}>Movimentações</NavButton>}{can('stock-positions.read') && <NavButton active={page === 'inventory'} onClick={() => navigate('inventory')}>Estoque</NavButton>}{reportsStart && <NavButton active={page === 'reports' || page === 'reports-reviews' || page === 'reports-stock'} onClick={() => navigate(reportsStart)}>Relatórios</NavButton>}<p className="nav-group-label">Cadastros</p><NavButton active={page === 'products'} onClick={() => navigate('products')}>Produtos</NavButton><NavButton active={page === 'stocks'} onClick={() => navigate('stocks')}>Estoques e locais</NavButton></nav><p className="sidebar-note">Operacao segura e rastreavel</p></aside>
    <main className="workspace" id="main-content" tabIndex={-1}>
      {page === 'home' && can('shipments.read') && <ShipmentHomeNotice onOpen={() => navigate('shipments')} />}
      {page === 'shipments' && can('shipments.read') && <ShipmentsPage key={activeSector} user={activeUser} />}
      {page === 'home' && <HomePage navigate={navigate} onTransfer={() => openTransfer()} onReview={() => openReview()} inventory={can('stock-positions.read')} movementsCreate={can('movements.create')} movementsRead={can('movements.read')} />}
      {page === 'operations' && can('shipments.read') && <button className="button-wide" onClick={() => navigate('shipments')}>Envios · Produção e Expedição</button>}
      {page === 'operations' && can('movements.create') && <OperationsPage navigate={navigate} onTransfer={() => openTransfer()} onReview={() => openReview()} />}
      {page === 'new-entry' && can('movements.create') && <ExternalEntryPage onCreated={(id) => completeMovement(id, 'Entrada registrada com sucesso.')} />}
      {page === 'new-exit' && can('movements.create') && <ExternalExitPage onCreated={(id) => completeMovement(id, 'Saida registrada com sucesso.')} />}
      {page === 'new-transfer' && can('movements.create') && <InternalTransferPage prefill={transferPrefill} onCreated={(id) => completeMovement(id, 'Transferencia realizada com sucesso.')} />}
      {page === 'new-review' && can('movements.create') && <ReviewPage prefill={reviewPrefill} onCreated={(id) => completeMovement(id, 'Revisao realizada com sucesso.')} />}
      {page === 'movements' && can('movements.read') && <MovementsPage initialId={selectedMovementId} success={movementSuccess} canCancel={can('movements.cancel')} />}
      {page === 'products' && <ProductsPage canWrite={can('products.create') || can('products.update')} />}
      {page === 'stocks' && <StocksPage canWrite={can('stocks.create') || can('stocks.update')} />}
      {page === 'inventory' && can('stock-positions.read') && <InventoryPage onTransfer={can('movements.create') ? openTransfer : undefined} onReview={can('movements.create') ? openReview : undefined} />}
      {page === 'reports' && can('movements.read') && <ReportsPage onReviews={() => navigate('reports-reviews')} onStock={can('stock-positions.read') ? () => navigate('reports-stock') : undefined} />}
      {page === 'reports-reviews' && can('movements.read') && <ReviewReportsPage onMovements={() => navigate('reports')} onStock={can('stock-positions.read') ? () => navigate('reports-stock') : undefined} />}
      {page === 'reports-stock' && can('stock-positions.read') && <StockReportsPage onMovements={can('movements.read') ? () => navigate('reports') : undefined} onReviews={can('movements.read') ? () => navigate('reports-reviews') : undefined} />}
      {page === 'more' && can('shipments.read') && <button className="button-wide" onClick={() => navigate('shipments')}>Envios entre setores</button>}
      {page === 'more' && <MorePage navigate={navigate} username={user.username} logout={logout} busy={loggingOut} reportsPage={reportsStart} onHistory={can('movements.read') ? openHistory : undefined} />}
    </main>
    <nav className="bottom-nav" aria-label="Navegação principal mobile">
      <NavButton active={page === 'home'} onClick={() => navigate('home')}>Início</NavButton>
      {can('movements.create') && <NavButton active={page === 'operations' || page.startsWith('new-')} onClick={() => navigate('operations')}>Operações</NavButton>}
      {can('stock-positions.read') && <NavButton active={page === 'inventory'} onClick={() => navigate('inventory')}>Estoque</NavButton>}
      <NavButton active={['more', 'movements', 'reports', 'reports-reviews', 'reports-stock', 'products', 'stocks'].includes(page)} onClick={() => navigate('more')}>Menu</NavButton>
    </nav>
  </div>;
}
