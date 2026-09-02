import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  api,
  Batch,
  Paginated,
  Product,
  ResolvedBatchCode,
  StockLocation,
  StockLocationKind,
  StockPosition,
  UnitConversion,
  UserSession,
} from './api';

type Page = 'products' | 'batches' | 'stocks' | 'inventory';

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'Ocorreu um erro inesperado.';
}

function Login({ onAuthenticated }: { onAuthenticated: (user: UserSession) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api.login(username, password);
      onAuthenticated(result.user);
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setBusy(false);
    }
  }

  return <main className="login-page">
    <form className="card login-card" onSubmit={(event) => void submit(event)}>
      <p className="eyebrow">Acesso seguro</p>
      <h1>Estoque Revisao</h1>
      <label>Usuario<input value={username} onChange={(event) => setUsername(event.target.value)} required /></label>
      <label>Senha<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
      {error && <p className="alert">{error}</p>}
      <button disabled={busy}>{busy ? 'Entrando...' : 'Entrar'}</button>
    </form>
  </main>;
}

function ProductsPage({ canWrite }: { canWrite: boolean }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [conversions, setConversions] = useState<UnitConversion[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Product | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<Paginated<Product>>(`/products?limit=100&search=${encodeURIComponent(search)}`);
      setProducts(data.items);
    } catch (caught) { setError(messageFrom(caught)); }
  }, [search]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = { code: form.get('code'), name: form.get('name'), defaultUnit: form.get('defaultUnit') };
    try {
      if (editing?.id) await api.patch(`/products/${editing.id}`, payload);
      else await api.post('/products', payload);
      setEditing(null);
      event.currentTarget.reset();
      await load();
    } catch (caught) { setError(messageFrom(caught)); }
  }

  async function selectProduct(product: Product) {
    setSelected(product);
    try { setConversions(await api.get(`/products/${product.id}/conversions`)); }
    catch (caught) { setError(messageFrom(caught)); }
  }

  async function addConversion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    try {
      await api.post(`/products/${selected.id}/conversions`, {
        fromUnit: form.get('fromUnit'),
        toUnit: form.get('toUnit'),
        factor: Number(form.get('factor')),
      });
      setConversions(await api.get(`/products/${selected.id}/conversions`));
      event.currentTarget.reset();
    } catch (caught) { setError(messageFrom(caught)); }
  }

  async function toggle(product: Product) {
    try { await api.patch(`/products/${product.id}/status`, { active: !product.active }); await load(); }
    catch (caught) { setError(messageFrom(caught)); }
  }

  return <div className="content-grid">
    <section className="card">
      <div className="section-heading">
        <div><p className="eyebrow">Cadastro base</p><h2>Produtos</h2></div>
        <input aria-label="Buscar produtos" placeholder="Buscar..." value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>
      {error && <p className="alert">{error}</p>}
      <div className="table-wrap"><table><thead><tr><th>Codigo</th><th>Produto</th><th>Unidade</th><th>Status</th><th /></tr></thead>
        <tbody>{products.map((product) => <tr key={product.id} className={selected?.id === product.id ? 'selected' : ''}>
          <td><button className="link" onClick={() => void selectProduct(product)}>{product.code}</button></td>
          <td>{product.name}</td><td>{product.defaultUnit}</td>
          <td><span className={`badge ${product.active ? 'active' : ''}`}>{product.active ? 'Ativo' : 'Inativo'}</span></td>
          <td className="actions">{canWrite && <><button className="secondary" onClick={() => setEditing(product)}>Editar</button><button className="secondary" onClick={() => void toggle(product)}>{product.active ? 'Inativar' : 'Ativar'}</button></>}</td>
        </tr>)}</tbody></table></div>
      {canWrite && <form key={editing?.id ?? 'new'} className="form-grid" onSubmit={(event) => void saveProduct(event)}>
        <h3>{editing ? 'Editar produto' : 'Novo produto'}</h3>
        <label>Codigo<input name="code" defaultValue={editing?.code} required maxLength={60} /></label>
        <label>Nome<input name="name" defaultValue={editing?.name} required maxLength={200} /></label>
        <label>Unidade padrao<input name="defaultUnit" defaultValue={editing?.defaultUnit} required maxLength={20} /></label>
        <div className="actions"><button>Salvar</button>{editing && <button type="button" className="secondary" onClick={() => setEditing(null)}>Cancelar</button>}</div>
      </form>}
    </section>
    <aside className="card detail-card"><p className="eyebrow">Detalhe</p><h2>{selected?.name ?? 'Selecione um produto'}</h2>
      {selected && <><dl><dt>Codigo</dt><dd>{selected.code}</dd><dt>Unidade padrao</dt><dd>{selected.defaultUnit}</dd></dl>
        <h3>Conversoes de unidade</h3>
        {conversions.length === 0 ? <p className="muted">Nenhuma conversao cadastrada.</p> : <ul className="conversion-list">{conversions.map((item) => <li key={item.id}>{item.fromUnit} → {item.factor} {item.toUnit}</li>)}</ul>}
        {canWrite && <form className="compact-form" onSubmit={(event) => void addConversion(event)}><input name="fromUnit" placeholder="De" required /><input name="toUnit" placeholder="Para" required /><input name="factor" type="number" min="0.000001" step="0.000001" placeholder="Fator" required /><button>Adicionar</button></form>}
      </>}
    </aside>
  </div>;
}

function BatchesPage({ canWrite }: { canWrite: boolean }) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Batch | null>(null);
  const [code, setCode] = useState('');
  const [manufacturingDate, setManufacturingDate] = useState('');
  const [expirationDate, setExpirationDate] = useState('');

  const load = useCallback(async () => {
    try {
      const [batchData, productData] = await Promise.all([
        api.get<Paginated<Batch>>('/batches?limit=100'),
        api.get<Paginated<Product>>('/products?limit=100&active=true'),
      ]);
      setBatches(batchData.items);
      setProducts(productData.items);
    } catch (caught) { setError(messageFrom(caught)); }
  }, []);
  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const payload = { code, manufacturingDate, expirationDate };
      if (editing) await api.patch(`/batches/${editing.id}`, payload);
      else await api.post('/batches', { ...payload, productId: form.get('productId') });
      setEditing(null);
      setCode('');
      setManufacturingDate('');
      setExpirationDate('');
      event.currentTarget.reset();
      await load();
    } catch (caught) { setError(messageFrom(caught)); }
  }

  async function resolveBatch(values: { code?: string; manufacturingDate?: string }) {
    if (!(values.code ?? values.manufacturingDate)) return;
    try {
      setError('');
      const resolved = await api.post<ResolvedBatchCode>('/batches/resolve-code', values);
      setCode(resolved.code);
      setManufacturingDate(resolved.manufacturingDate);
    } catch (caught) { setError(messageFrom(caught)); }
  }

  function beginEdit(batch: Batch) {
    setEditing(batch);
    setCode(batch.code);
    setManufacturingDate(batch.manufacturingDate);
    setExpirationDate(batch.expirationDate);
  }

  function cancelEdit() {
    setEditing(null);
    setCode('');
    setManufacturingDate('');
    setExpirationDate('');
  }

  const productName = (batch: Batch) => products.find((product) => product.id === batch.productId)?.name ?? batch.product?.name ?? 'Produto';
  return <section className="card"><p className="eyebrow">Rastreabilidade</p><h2>Lotes</h2><p className="muted">Informe a fabricacao ou o codigo CONSERVADI; o campo correspondente sera calculado automaticamente.</p>{error && <p className="alert">{error}</p>}
    <div className="table-wrap"><table><thead><tr><th>Lote</th><th>Produto</th><th>Fabricacao</th><th>Validade</th><th /></tr></thead><tbody>{batches.map((batch) => <tr key={batch.id}><td>{batch.code}</td><td>{productName(batch)}</td><td>{batch.manufacturingDate}</td><td>{batch.expirationDate}</td><td>{canWrite && <button className="secondary" onClick={() => beginEdit(batch)}>Editar</button>}</td></tr>)}</tbody></table></div>
    {canWrite && <form key={editing?.id ?? 'new'} className="form-grid" onSubmit={(event) => void create(event)}><h3>{editing ? 'Editar lote' : 'Novo lote'}</h3><label>Produto<select name="productId" defaultValue={editing?.productId ?? ''} required disabled={Boolean(editing)}><option value="">Selecione</option>{products.map((product) => <option key={product.id} value={product.id}>{product.code} — {product.name}</option>)}</select></label><label>Codigo do lote<input name="code" value={code} maxLength={6} pattern="[CONSERVADIconservadi]{6}" required onChange={(event) => setCode(event.target.value.toUpperCase())} onBlur={() => void resolveBatch({ code })} /></label><label>Fabricacao<input name="manufacturingDate" type="date" value={manufacturingDate} required onChange={(event) => { setManufacturingDate(event.target.value); void resolveBatch({ manufacturingDate: event.target.value }); }} /></label><label>Validade<input name="expirationDate" type="date" value={expirationDate} min={manufacturingDate} required onChange={(event) => setExpirationDate(event.target.value)} /></label><div className="actions"><button>Salvar lote</button>{editing && <button type="button" className="secondary" onClick={cancelEdit}>Cancelar</button>}</div></form>}
  </section>;
}

function InventoryPage() {
  const [positions, setPositions] = useState<StockPosition[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [selected, setSelected] = useState<StockPosition | null>(null);
  const [productId, setProductId] = useState('');
  const [batchId, setBatchId] = useState('');
  const [stockLocationId, setStockLocationId] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const query = new URLSearchParams({ limit: '100' });
    if (productId) query.set('productId', productId);
    if (batchId) query.set('batchId', batchId);
    if (stockLocationId) query.set('stockLocationId', stockLocationId);
    try {
      const [positionData, productData, batchData, locationData] = await Promise.all([
        api.get<Paginated<StockPosition>>(`/stock-positions?${query.toString()}`),
        api.get<Paginated<Product>>('/products?limit=100&active=true'),
        api.get<Paginated<Batch>>('/batches?limit=100'),
        api.get<Paginated<StockLocation>>('/stocks?limit=100&active=true'),
      ]);
      setPositions(positionData.items);
      setProducts(productData.items);
      setBatches(batchData.items);
      setLocations(locationData.items);
      setError('');
    } catch (caught) { setError(messageFrom(caught)); }
  }, [batchId, productId, stockLocationId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const availableBatches = productId ? batches.filter((batch) => batch.productId === productId) : batches;
  return <div className="content-grid">
    <section className="card"><p className="eyebrow">Consulta operacional</p><h2>Estoque atual</h2><p className="muted">Posicao consolidada por produto, lote e local. Alteracoes de saldo sao permitidas somente pelos servicos internos transacionais.</p>
      <div className="filter-grid"><label>Produto<select value={productId} onChange={(event) => { setProductId(event.target.value); setBatchId(''); }}><option value="">Todos</option>{products.map((product) => <option key={product.id} value={product.id}>{product.code} — {product.name}</option>)}</select></label><label>Lote<select value={batchId} onChange={(event) => setBatchId(event.target.value)}><option value="">Todos</option>{availableBatches.map((batch) => <option key={batch.id} value={batch.id}>{batch.code}</option>)}</select></label><label>Local<select value={stockLocationId} onChange={(event) => setStockLocationId(event.target.value)}><option value="">Todos</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.code} — {location.name}</option>)}</select></label></div>
      {error && <p className="alert">{error}</p>}
      <div className="table-wrap"><table><thead><tr><th>Produto</th><th>Lote</th><th>Fabricacao</th><th>Validade</th><th>Local</th><th>Quantidade</th></tr></thead><tbody>{positions.map((position) => <tr key={position.id} className={selected?.id === position.id ? 'selected' : ''} onClick={() => setSelected(position)}><td>{position.product.code} — {position.product.name}</td><td>{position.batch.code}</td><td>{position.batch.manufacturingDate}</td><td>{position.batch.expirationDate}</td><td>{position.stockLocation.name}</td><td>{position.quantity} {position.product.defaultUnit}</td></tr>)}</tbody></table></div>
      {positions.length === 0 && !error && <p className="muted">Nenhuma posicao encontrada para os filtros.</p>}
    </section>
    <aside className="card detail-card"><p className="eyebrow">Detalhe</p><h2>{selected?.product.name ?? 'Selecione uma posicao'}</h2>{selected && <dl><dt>Produto</dt><dd>{selected.product.code}</dd><dt>Lote</dt><dd>{selected.batch.code}</dd><dt>Fabricacao</dt><dd>{selected.batch.manufacturingDate}</dd><dt>Validade</dt><dd>{selected.batch.expirationDate}</dd><dt>Local</dt><dd>{selected.stockLocation.name}</dd><dt>Quantidade</dt><dd>{selected.quantity} {selected.product.defaultUnit}</dd></dl>}</aside>
  </div>;
}

function StocksPage({ canWrite }: { canWrite: boolean }) {
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<StockLocation | null>(null);
  const load = useCallback(async () => {
    try { setLocations((await api.get<Paginated<StockLocation>>('/stocks?limit=100')).items); }
    catch (caught) { setError(messageFrom(caught)); }
  }, []);
  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const kind = form.get('kind') as StockLocationKind;
    try {
      const payload = {
        code: form.get('code'),
        name: form.get('name'),
        description: form.get('description') || null,
        kind,
        parentId: form.get('parentId') || null,
      };
      if (editing) await api.patch(`/stocks/${editing.id}`, payload);
      else await api.post('/stocks', payload);
      setEditing(null);
      event.currentTarget.reset();
      await load();
    } catch (caught) { setError(messageFrom(caught)); }
  }

  async function toggle(location: StockLocation) {
    try { await api.patch(`/stocks/${location.id}/status`, { active: !location.active }); await load(); }
    catch (caught) { setError(messageFrom(caught)); }
  }

  const stockParents = locations.filter((item) => item.kind === 'STOCK' && item.active);
  return <section className="card"><p className="eyebrow">Estrutura logica</p><h2>Estoques e locais</h2><p className="muted">Cadastros de origem e destino. Os saldos consolidados estao disponiveis em Estoque atual.</p>{error && <p className="alert">{error}</p>}
    <div className="table-wrap"><table><thead><tr><th>Codigo</th><th>Nome</th><th>Tipo</th><th>Pai</th><th>Status</th><th /></tr></thead><tbody>{locations.map((location) => <tr key={location.id}><td>{location.code}</td><td>{location.name}</td><td>{location.kind}</td><td>{locations.find((item) => item.id === location.parentId)?.name ?? '—'}</td><td><span className={`badge ${location.active ? 'active' : ''}`}>{location.active ? 'Ativo' : 'Inativo'}</span></td><td className="actions">{canWrite && <><button className="secondary" onClick={() => setEditing(location)}>Editar</button><button className="secondary" onClick={() => void toggle(location)}>{location.active ? 'Inativar' : 'Ativar'}</button></>}</td></tr>)}</tbody></table></div>
    {canWrite && <form key={editing?.id ?? 'new'} className="form-grid" onSubmit={(event) => void create(event)}><h3>{editing ? 'Editar estoque ou local' : 'Novo estoque ou local'}</h3><label>Codigo<input name="code" defaultValue={editing?.code} required /></label><label>Nome<input name="name" defaultValue={editing?.name} required /></label><label>Tipo<select name="kind" defaultValue={editing?.kind ?? 'STOCK'} required><option value="STOCK">Estoque</option><option value="SUBSTOCK">Subestoque</option><option value="EXTERNAL">Origem/destino externo</option></select></label><label>Estoque pai (somente subestoque)<select name="parentId" defaultValue={editing?.parentId ?? ''}><option value="">Nenhum</option>{stockParents.filter((item) => item.id !== editing?.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="wide">Descricao<input name="description" defaultValue={editing?.description ?? ''} /></label><div className="actions"><button>Salvar local</button>{editing && <button type="button" className="secondary" onClick={() => setEditing(null)}>Cancelar</button>}</div></form>}
  </section>;
}

export function App() {
  const [user, setUser] = useState<UserSession | null>(null);
  const [checking, setChecking] = useState(true);
  const [page, setPage] = useState<Page>('products');
  useEffect(() => { void api.refresh().then((result) => setUser(result?.user ?? null)).finally(() => setChecking(false)); }, []);
  if (checking) return <main className="login-page"><p>Restaurando sessao...</p></main>;
  if (!user) return <Login onAuthenticated={setUser} />;
  const can = (permission: string) => user.permissions.includes(permission);
  return <div className="app-shell">
    <header><div><p className="eyebrow">Estoque Revisao</p><strong>Operacao de estoque</strong></div><nav><button className={page === 'products' ? 'current' : ''} onClick={() => setPage('products')}>Produtos</button><button className={page === 'batches' ? 'current' : ''} onClick={() => setPage('batches')}>Lotes</button><button className={page === 'stocks' ? 'current' : ''} onClick={() => setPage('stocks')}>Locais</button>{can('stock-positions.read') && <button className={page === 'inventory' ? 'current' : ''} onClick={() => setPage('inventory')}>Estoque atual</button>}</nav><div className="user-area"><span>{user.username}</span><button className="secondary" onClick={() => void api.logout().finally(() => setUser(null))}>Sair</button></div></header>
    <main className="workspace">{page === 'products' && <ProductsPage canWrite={can('products.create') || can('products.update')} />}{page === 'batches' && <BatchesPage canWrite={can('batches.create') || can('batches.update')} />}{page === 'stocks' && <StocksPage canWrite={can('stocks.create') || can('stocks.update')} />}{page === 'inventory' && can('stock-positions.read') && <InventoryPage />}</main>
  </div>;
}
