import { PositionSelect } from './PositionSelect';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api, Movement, Paginated, Product, StockLocation, StockPosition } from './api';
import { EmptyState, LoadingState, Modal, Notice, OperationGuide, PageHeader } from './components';
import { formatDate } from './format';
import { ProductAutocomplete } from './ProductAutocomplete';

export interface ExitPrefill {
  originLocationId: string;
  productId: string;
  batchId: string;
}

interface ExitDraftItem {
  key: string;
  position: StockPosition;
  quantity: number;
}

const messageFrom = (error: unknown) => error instanceof Error
  ? error.message
  : 'Ocorreu um erro inesperado.';

export function ExternalExitPage({
  prefill,
  onCreated,
}: {
  prefill?: ExitPrefill;
  onCreated: (id: string) => void;
}) {
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [positions, setPositions] = useState<StockPosition[]>([]);
  const [originId, setOriginId] = useState(prefill?.originLocationId ?? '');
  const [destinationId, setDestinationId] = useState('');
  const [productId, setProductId] = useState(prefill?.productId ?? '');
  const [batchId, setBatchId] = useState(prefill?.batchId ?? '');
  const [quantity, setQuantity] = useState('');
  const [observation, setObservation] = useState('');
  const [items, setItems] = useState<ExitDraftItem[]>([]);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [loading, setLoading] = useState(true);
  const [loadingStock, setLoadingStock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void api.get<Paginated<StockLocation>>('/stocks?limit=100&active=true')
        .then((result) => setLocations(result.items))
        .catch((caught) => setError(messageFrom(caught)))
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const loadPositions = useCallback(async () => {
    if (!originId) {
      setPositions([]);
      return;
    }
    setLoadingStock(true);
    try {
      const result = await api.get<Paginated<StockPosition>>(
        `/stock-positions?limit=100&stockLocationId=${originId}`,
      );
      setPositions(result.items);
      setError('');
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setLoadingStock(false);
    }
  }, [originId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadPositions(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadPositions]);

  const origins = locations.filter((location) => location.kind !== 'EXTERNAL');
  const destinations = locations.filter((location) => location.kind === 'EXTERNAL' && !location.sector);
  const products = useMemo(() => {
    const unique = new Map<string, Product>();
    positions.forEach((position) => unique.set(position.productId, position.product));
    return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [positions]);
  const productPositions = positions.filter((position) => position.productId === productId);
  const selectedProduct = products.find((product) => product.id === productId);
  const selectedPosition = positions.find(
    (position) => position.productId === productId && position.batchId === batchId,
  );
  const locationFor = (id: string) => locations.find((location) => location.id === id);

  function changeOrigin(value: string) {
    setOriginId(value);
    setProductId('');
    setBatchId('');
    setItems([]);
  }

  function closeItem() { setAdding(false); setError(''); setProductId(''); setBatchId(''); setQuantity(''); }

  function addItem(event: FormEvent) {
    event.preventDefault();
    const numericQuantity = Number(quantity);
    if (!selectedPosition || !Number.isInteger(numericQuantity) || numericQuantity <= 0) {
      setError('Selecione uma posicao com saldo e informe uma quantidade inteira positiva.');
      return;
    }
    if (numericQuantity > selectedPosition.quantity) {
      setError(`Saldo insuficiente. Disponivel: ${selectedPosition.quantity}.`);
      return;
    }
    if (items.some((item) => item.position.productId === productId && item.position.batchId === batchId)) {
      setError('Este produto e lote ja foi adicionado. Remova o item para altera-lo.');
      return;
    }
    setItems((current) => [...current, {
      key: crypto.randomUUID(),
      position: selectedPosition,
      quantity: numericQuantity,
    }]);
    closeItem();
  }

  async function submit() {
    setBusy(true);
    setError('');
    try {
      const movement = await api.post<Movement>('/movements/external-exits', {
        requestKey,
        originLocationId: originId,
        destinationLocationId: destinationId,
        observation: observation || undefined,
        items: items.map((item) => ({
          productId: item.position.productId,
          batchId: item.position.batchId,
          quantity: item.quantity,
        })),
      });
      setRequestKey(crypto.randomUUID());
      setConfirming(false);
      onCreated(movement.id);
    } catch (caught) {
      setError(messageFrom(caught));
      setConfirming(false);
      await loadPositions();
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingState label="Preparando nova saida" />;

  return <>
    <PageHeader
      eyebrow="Movimentacao"
      title="Saída externa"
      description="Selecione uma origem controlada; produtos e lotes exibidos possuem saldo disponivel."
    />
    <OperationGuide />
    {error && !adding && <Notice kind="error" onClose={() => setError('')}>{error}</Notice>}
    <section className="surface form-panel">
      <h2><span className="step-number">1</span> Origem e destino</h2>
      <div className="form-grid">
        <label><span>Origem controlada <span className="required">*</span></span>
          <select value={originId} onChange={(event) => changeOrigin(event.target.value)} required>
            <option value="">Selecione</option>
            {origins.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
          </select>
        </label>
        <label><span>Destino externo <span className="required">*</span></span>
          <select value={destinationId} onChange={(event) => setDestinationId(event.target.value)} required>
            <option value="">Selecione</option>
            {destinations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
          </select>
        </label>
        <label className="wide">Observação (opcional)
          <textarea value={observation} onChange={(event) => setObservation(event.target.value)} maxLength={1000} rows={3} />
        </label>
      </div>
    </section>
    {adding && <Modal labelledBy="add-product-title" onClose={closeItem}>
      <div className="panel-heading item-list-heading"><h2 id="add-product-title">Adicionar produto</h2><button type="button" className="secondary" onClick={closeItem}>Cancelar</button></div>
      {error && <Notice kind="error">{error}</Notice>}
      {!originId ? <p className="muted">Escolha a origem para consultar o saldo.</p> : loadingStock ? <LoadingState label="Consultando saldo da origem" /> : positions.length === 0 ? <EmptyState title="Origem sem saldo disponivel" description="Escolha outro local ou registre uma entrada antes da saida." /> : <form className="form-grid" onSubmit={addItem}>
        <ProductAutocomplete availableProducts={products} initialProduct={selectedProduct} onChange={(selected) => { setProductId(selected?.id ?? ''); setBatchId(''); }} />
        <PositionSelect label="Lote *" value={batchId} onChange={setBatchId} disabled={!productId}
          options={productPositions.map((position) => ({ value: position.batchId, label: `Lote: ${position.batch.code} · val: ${formatDate(position.batch.expirationDate)} · saldo: ${position.quantity}` }))} />
        {selectedPosition && <div className="available-balance" role="status"><span>Saldo disponivel</span><strong>{selectedPosition.quantity} {selectedPosition.product.defaultUnit}</strong><small>Validade {formatDate(selectedPosition.batch.expirationDate)}</small></div>}
        <label><span>Quantidade <span className="required">*</span></span>
          <input inputMode="numeric" type="number" min="1" max={selectedPosition?.quantity} step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
        </label>
        <div className="form-actions"><button>+ Adicionar</button></div>
      </form>}
    </Modal>}
    <section className="surface list-panel">
      <div className="panel-heading item-list-heading"><h2>Produtos ({items.length})</h2><button type="button" disabled={!originId || busy} onClick={() => { setError(''); setAdding(true); }}>Adicionar produto</button></div>
      {items.length === 0 ? <EmptyState title="Nenhum item adicionado" description="Adicione ao menos um produto e lote com saldo." /> : <div className="entry-items">{items.map((item) => <article key={item.key} className="entry-item"><div><strong>{item.position.product.name}</strong><span>Lote {item.position.batch.code} / validade {formatDate(item.position.batch.expirationDate)}</span><span>{item.quantity} de {item.position.quantity} {item.position.product.defaultUnit} disponiveis</span></div><button className="secondary" onClick={() => setItems((current) => current.filter((candidate) => candidate.key !== item.key))}>Remover</button></article>)}</div>}
      {(!originId || !destinationId || items.length === 0) && <p className="action-hint">Selecione origem, destino e adicione ao menos um item para continuar.</p>}<button className="button-wide" disabled={!originId || !destinationId || items.length === 0 || busy} onClick={() => setConfirming(true)}>Revisar saida</button>
    </section>
    {confirming && <Modal labelledBy="exit-confirm-title" busy={busy} onClose={() => setConfirming(false)}><p className="eyebrow">Confirmacao</p><h2 id="exit-confirm-title">Confirmar saida para {locationFor(destinationId)?.name}?</h2><p>Origem: <strong>{locationFor(originId)?.name}</strong>. {items.length} item(ns).</p><ul>{items.map((item) => <li key={item.key}>{item.position.product.name} / lote {item.position.batch.code} / validade {formatDate(item.position.batch.expirationDate)}: <strong>{item.quantity} {item.position.product.defaultUnit}</strong></li>)}</ul><p>O saldo da origem sera reduzido e o registro ficara imutavel no historico.</p><div className="dialog-actions"><button className="secondary" disabled={busy} onClick={() => setConfirming(false)}>Voltar e corrigir</button><button disabled={busy} onClick={() => void submit()}>{busy ? 'Efetivando...' : 'Confirmar saida'}</button></div></Modal>}
  </>;
}
