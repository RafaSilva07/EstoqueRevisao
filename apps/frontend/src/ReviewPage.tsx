import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, Movement, Paginated, Product, StockLocation, StockPosition } from './api';
import { EmptyState, LoadingState, Notice, PageHeader } from './components';
import { formatDate } from './format';
import { calculateDistribution, quantityUnits } from './review';

export interface ReviewPrefill {
  productId: string;
  batchId: string;
}

interface ReviewDraftItem {
  key: string;
  position: StockPosition;
  quantity: string;
  distributions: Record<string, string>;
}

const messageFrom = (error: unknown) => error instanceof Error
  ? error.message
  : 'Ocorreu um erro inesperado.';

export function ReviewPage({
  prefill,
  onCreated,
}: {
  prefill?: ReviewPrefill;
  onCreated: (id: string) => void;
}) {
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [positions, setPositions] = useState<StockPosition[]>([]);
  const [productId, setProductId] = useState(prefill?.productId ?? '');
  const [batchId, setBatchId] = useState(prefill?.batchId ?? '');
  const [items, setItems] = useState<ReviewDraftItem[]>([]);
  const [observation, setObservation] = useState('');
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const prefillApplied = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const locationData = await api.get<Paginated<StockLocation>>('/stocks?limit=100&active=true');
      const source = locationData.items.find((location) => location.reviewRole === 'SOURCE');
      setLocations(locationData.items);
      if (!source) {
        setPositions([]);
        setError('O local de origem da revisao nao esta configurado.');
        return;
      }
      const positionData = await api.get<Paginated<StockPosition>>(
        `/stock-positions?limit=100&stockLocationId=${source.id}`,
      );
      setPositions(positionData.items);
      setError('');
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const destinations = useMemo(
    () => locations.filter((location) => location.reviewRole === 'DESTINATION'),
    [locations],
  );
  const products = useMemo(() => {
    const unique = new Map<string, Product>();
    positions.forEach((position) => unique.set(position.productId, position.product));
    return [...unique.values()].sort((left, right) => left.name.localeCompare(right.name));
  }, [positions]);
  const productPositions = positions.filter((position) => position.productId === productId);
  const selectedPosition = positions.find(
    (position) => position.productId === productId && position.batchId === batchId,
  );

  const addPosition = useCallback((position: StockPosition) => {
    setItems((current) => {
      if (current.some((item) => (
        item.position.productId === position.productId && item.position.batchId === position.batchId
      ))) return current;
      return [...current, {
        key: crypto.randomUUID(),
        position,
        quantity: '',
        distributions: {},
      }];
    });
  }, []);

  useEffect(() => {
    if (!prefill || prefillApplied.current || loading) return;
    const position = positions.find((candidate) => (
      candidate.productId === prefill.productId && candidate.batchId === prefill.batchId
    ));
    if (!position) return;
    const timeout = window.setTimeout(() => {
      addPosition(position);
      prefillApplied.current = true;
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [addPosition, loading, positions, prefill]);

  function addSelected() {
    if (!selectedPosition) {
      setError('Selecione um produto e lote com saldo em Revisar.');
      return;
    }
    if (items.some((item) => (
      item.position.productId === selectedPosition.productId
      && item.position.batchId === selectedPosition.batchId
    ))) {
      setError('Este produto e lote ja foi adicionado.');
      return;
    }
    addPosition(selectedPosition);
    setBatchId('');
    setError('');
  }

  function updateItem(key: string, update: (item: ReviewDraftItem) => ReviewDraftItem) {
    setItems((current) => current.map((item) => item.key === key ? update(item) : item));
  }

  const itemState = (item: ReviewDraftItem) => {
    return calculateDistribution(item.quantity, Object.values(item.distributions));
  };
  const ready = items.length > 0 && items.every((item) => {
    const state = itemState(item);
    return state.reviewed > 0
      && state.reviewed <= quantityUnits(item.position.quantity)
      && state.difference === 0;
  });
  const totalReviewed = items.reduce((total, item) => total + Number(item.quantity || 0), 0);

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    setError('');
    try {
      const movement = await api.post<Movement>('/movements/reviews', {
        requestKey,
        observation: observation || undefined,
        items: items.map((item) => ({
          productId: item.position.productId,
          batchId: item.position.batchId,
          quantity: Number(item.quantity),
          distributions: destinations
            .map((destination) => ({
              destinationLocationId: destination.id,
              quantity: Number(item.distributions[destination.id] || 0),
            }))
            .filter((distribution) => distribution.quantity > 0),
        })),
      });
      setRequestKey(crypto.randomUUID());
      setConfirming(false);
      onCreated(movement.id);
    } catch (caught) {
      setError(messageFrom(caught));
      setConfirming(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingState label="Preparando revisao de produtos" />;

  return <>
    <PageHeader
      eyebrow="Classificacao"
      title="Revisar produtos"
      description="Distribua integralmente a quantidade revisada entre os destinos permitidos."
    />
    {error && <Notice kind="error" onClose={() => setError('')}>{error}</Notice>}
    <section className="surface form-panel">
      <h2>Adicionar produto/lote</h2>
      {positions.length === 0 ? <EmptyState title="Nenhum saldo em Revisar" description="Registre uma entrada em Revisar antes de iniciar esta operacao." /> : <div className="form-grid">
        <label><span>Produto <span className="required">*</span></span>
          <select value={productId} onChange={(event) => { setProductId(event.target.value); setBatchId(''); }}>
            <option value="">Selecione</option>
            {products.map((product) => <option key={product.id} value={product.id}>{product.code} - {product.name}</option>)}
          </select>
        </label>
        <label><span>Lote <span className="required">*</span></span>
          <select value={batchId} onChange={(event) => setBatchId(event.target.value)} disabled={!productId}>
            <option value="">Selecione</option>
            {productPositions.map((position) => <option key={position.id} value={position.batchId}>{position.batch.code} - saldo {position.quantity}</option>)}
          </select>
        </label>
        {selectedPosition && <div className="available-balance" role="status"><span>Disponivel em Revisar</span><strong>{selectedPosition.quantity} {selectedPosition.product.defaultUnit}</strong><small>Validade {formatDate(selectedPosition.batch.expirationDate)}</small></div>}
        <div className="form-actions"><button type="button" onClick={addSelected}>+ Adicionar produto/lote</button></div>
      </div>}
      <label className="review-observation">Observacao
        <textarea value={observation} onChange={(event) => setObservation(event.target.value)} maxLength={1000} rows={3} />
      </label>
    </section>
    <section className="review-items" aria-label="Itens da revisao">
      {items.length === 0 ? <div className="surface list-panel"><EmptyState title="Nenhum item adicionado" description="Adicione um produto e lote que possua saldo em Revisar." /></div> : items.map((item) => {
        const state = itemState(item);
        const available = quantityUnits(item.position.quantity);
        const feedback = state.reviewed <= 0
          ? 'Informe a quantidade que sera revisada.'
          : state.reviewed > available
            ? `Saldo insuficiente em Revisar. Disponivel: ${item.position.quantity}.`
            : state.difference > 0
              ? `Faltam distribuir: ${state.difference / 1_000_000}`
              : state.difference < 0
                ? `A distribuicao excede a quantidade revisada em ${Math.abs(state.difference) / 1_000_000}`
                : 'Distribuicao completa.';
        const complete = state.reviewed > 0 && state.reviewed <= available && state.difference === 0;
        return <article className="surface review-card" key={item.key}>
          <header><div><p className="eyebrow">Produto/lote</p><h2>{item.position.product.code} - {item.position.product.name}</h2><p>Lote {item.position.batch.code} · validade {formatDate(item.position.batch.expirationDate)}</p></div><button className="secondary" onClick={() => setItems((current) => current.filter((candidate) => candidate.key !== item.key))}>Remover</button></header>
          <div className="review-balance"><span>Disponivel em Revisar</span><strong>{item.position.quantity} {item.position.product.defaultUnit}</strong></div>
          <label><span>Quantidade a revisar <span className="required">*</span></span><input type="number" min="0.000001" max={item.position.quantity} step="0.000001" value={item.quantity} onChange={(event) => updateItem(item.key, (current) => ({ ...current, quantity: event.target.value }))} /></label>
          <fieldset><legend>Distribuicao</legend><div className="review-destinations">{destinations.map((destination) => <label key={destination.id}>{destination.name}<input type="number" min="0" step="0.000001" value={item.distributions[destination.id] ?? ''} placeholder="0" onChange={(event) => updateItem(item.key, (current) => ({ ...current, distributions: { ...current.distributions, [destination.id]: event.target.value } }))} /></label>)}</div></fieldset>
          <p className={`distribution-feedback ${complete ? 'complete' : 'incomplete'}`} role="status">{feedback}<span>Distribuido: {state.distributed / 1_000_000} / {state.reviewed / 1_000_000}</span></p>
        </article>;
      })}
    </section>
    <section className="surface review-submit"><div><span>Total revisado</span><strong>{totalReviewed} unidade(s) em {items.length} produto(s)/lote(s)</strong></div><button disabled={!ready || busy} onClick={() => setConfirming(true)}>Revisar operacao</button></section>
    {confirming && <div className="dialog-backdrop"><section className="dialog confirmation-dialog" role="dialog" aria-modal="true" aria-labelledby="review-confirm-title"><p className="eyebrow">Resumo</p><h2 id="review-confirm-title">Confirmar revisao?</h2><p>{items.length} produto(s)/lote(s), total revisado de <strong>{totalReviewed}</strong>.</p><ul className="review-summary">{items.map((item) => <li key={item.key}><strong>{item.position.product.name} / lote {item.position.batch.code}: {item.quantity}</strong><ul>{destinations.map((destination) => ({ destination, quantity: Number(item.distributions[destination.id] || 0) })).filter(({ quantity }) => quantity > 0).map(({ destination, quantity }) => <li key={destination.id}>{quantity} → {destination.name}</li>)}</ul></li>)}</ul><p>A quantidade sera retirada de Revisar e distribuida integralmente em uma unica operacao.</p><div className="dialog-actions"><button className="secondary" disabled={busy} onClick={() => setConfirming(false)}>Voltar e corrigir</button><button disabled={busy} onClick={() => void submit()}>{busy ? 'Processando revisao...' : 'Confirmar revisao'}</button></div></section></div>}
  </>;
}
