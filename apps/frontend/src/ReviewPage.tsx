import { PositionSelect } from './PositionSelect';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, OperationalSettings, Paginated, Product, StockLocation, StockPosition } from './api';
import { EmptyState, LoadingState, Modal, Notice, OperationGuide, PageHeader } from './components';
import { formatDate } from './format';
import { calculateDistribution, isIntegerQuantity, quantityUnits } from './review';
import { useMovementSubmission } from './useMovementSubmission';
import { ProductAutocomplete } from './ProductAutocomplete';

export interface ReviewPrefill {
  productId: string;
  batchId: string;
}

interface ReviewDraftItem {
  key: string;
  position: StockPosition;
  quantity: string;
  outputProductId: string;
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
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<ReviewDraftItem | null>(null);
  const [items, setItems] = useState<ReviewDraftItem[]>([]);
  const [observation, setObservation] = useState('');
  const [loading, setLoading] = useState(true);
  const submission = useMovementSubmission('/movements/reviews', onCreated);
  const busy = submission.busy;
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const prefillApplied = useRef(false);

  const load = useCallback(async (preserveError = false) => {
    setLoading(true);
    try {
      const [locationData, configuration] = await Promise.all([
        api.get<Paginated<StockLocation>>('/stocks?limit=100&active=true'),
        api.get<OperationalSettings>('/settings/operational'),
      ]);
      const source = locationData.items.find((location) => location.reviewRole === 'SOURCE');
      setLocations([...(source ? [source] : []), ...configuration.reviewDestinations]);
      if (!source) {
        setPositions([]);
        setError('O local de origem da revisao nao esta configurado.');
        return;
      }
      const positionData = await api.get<Paginated<StockPosition>>(
        `/stock-positions?limit=100&stockLocationId=${source.id}`,
      );
      setPositions(positionData.items);
      if (!preserveError) setError('');
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
    () => locations.filter((location) => location.reviewRole !== 'SOURCE'),
    [locations],
  );
  const products = useMemo(() => {
    const unique = new Map<string, Product>();
    positions.forEach((position) => unique.set(position.productId, position.product));
    return [...unique.values()].sort((left, right) => left.name.localeCompare(right.name));
  }, [positions]);
  const productPositions = positions.filter((position) => position.productId === productId);
  const selectedProduct = products.find((product) => product.id === productId);
  const selectedPosition = positions.find(
    (position) => position.productId === productId && position.batchId === batchId,
  );

  const addPosition = useCallback((position: StockPosition) => {
    setDraft({ key: crypto.randomUUID(), position, quantity: '', outputProductId: '', distributions: {} });
    setAdding(true);
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
    setDraft((item) => item?.key === key ? update(item) : item);
  }

  const itemState = (item: ReviewDraftItem) => {
    const factor = ['FD', 'CX'].includes(item.position.product.defaultUnit) ? item.position.product.unitsPerPackage ?? 0 : 1;
    return calculateDistribution(Number(item.quantity || 0) * factor, Object.values(item.distributions));
  };
  const itemReady = (item: ReviewDraftItem) => {
    const state = itemState(item);
    return isIntegerQuantity(item.quantity)
      && Object.values(item.distributions).every(isIntegerQuantity)
      && state.reviewed > 0
      && Number(item.quantity) <= quantityUnits(item.position.quantity)
      && (!['FD', 'CX'].includes(item.position.product.defaultUnit) || Boolean(item.position.product.unitProducts?.some((product) => product.id === item.outputProductId && product.active && product.defaultUnit === 'UN')))
      && state.difference === 0;
  };
  const ready = items.length > 0 && items.every(itemReady);
  const totals = new Map<string, number>();
  items.forEach((item) => { const unit = ['FD', 'CX'].includes(item.position.product.defaultUnit) ? 'UN' : item.position.product.defaultUnit; totals.set(unit, (totals.get(unit) ?? 0) + itemState(item).reviewed); });
  const totalReviewed = [...totals].map(([unit, quantity]) => `${quantity} ${unit}`).join(' + ') || '0 UN';

  async function submit() {
    if (!ready || busy) return;
    setError('');
    await submission.submit({
        observation: observation || undefined,
        items: items.map((item) => ({
          productId: item.position.productId,
          batchId: item.position.batchId,
          quantity: Number(item.quantity),
          ...(item.outputProductId ? { outputProductId: item.outputProductId, expectedUnitsPerPackage: item.position.product.unitsPerPackage } : {}),
          distributions: destinations
            .map((destination) => ({
              destinationLocationId: destination.id,
              quantity: Number(item.distributions[destination.id] || 0),
            }))
            .filter((distribution) => distribution.quantity > 0),
        })),
    });
  }

  function closeItem() { setAdding(false); setDraft(null); setError(''); }

  function renderEditor(item: ReviewDraftItem) {
    const state = itemState(item);
    const available = quantityUnits(item.position.quantity);
    const integerValues = isIntegerQuantity(item.quantity)
      && Object.values(item.distributions).every(isIntegerQuantity);
    const feedback = !integerValues
      ? 'Use apenas quantidades inteiras.'
      : state.reviewed <= 0
      ? 'Informe a quantidade que sera revisada.'
      : Number(item.quantity) > available
        ? `Saldo insuficiente em Revisar. Disponivel: ${item.position.quantity}.`
        : state.difference > 0
          ? `Faltam distribuir: ${state.difference}`
          : state.difference < 0
            ? `A distribuicao excede a quantidade revisada em ${Math.abs(state.difference)}`
            : 'Distribuicao completa.';
    const complete = integerValues && state.reviewed > 0 && Number(item.quantity) <= available && state.difference === 0;
    return <article className="surface review-card" key={item.key}>
      <header><div><p className="eyebrow">Produto/lote</p><h2>{item.position.product.code} - {item.position.product.name}</h2><p>Lote {item.position.batch.code} · validade {formatDate(item.position.batch.expirationDate)}</p></div></header>
      <div className="review-balance"><span>Disponivel em Revisar</span><strong>{item.position.quantity} {item.position.product.defaultUnit}</strong></div>
      <label><span>Quantidade a revisar <span className="required">*</span></span><input autoFocus inputMode="numeric" type="number" min="1" max={item.position.quantity} step="1" value={item.quantity} onChange={(event) => updateItem(item.key, (current) => ({ ...current, quantity: event.target.value }))} /></label>
      {['FD', 'CX'].includes(item.position.product.defaultUnit) && <div className="available-balance"><p>{item.quantity || 0} {item.position.product.defaultUnit} × {item.position.product.unitsPerPackage ?? '?'} = <strong>{state.reviewed} UN</strong></p>
        {!item.position.product.unitsPerPackage && <p>Configure a quantidade por embalagem no cadastro antes de revisar.</p>}
        <label>Produto unitário resultante *<select value={item.outputProductId} onChange={(event) => updateItem(item.key, (current) => ({ ...current, outputProductId: event.target.value }))}><option value="">Selecione o código unitário</option>{item.position.product.unitProducts?.filter((product) => product.active && product.defaultUnit === 'UN').map((product) => <option key={product.id} value={product.id}>{product.code} — {product.name}</option>)}</select></label>
        <small>Lote, fabricação e validade serão preservados. Distribua as quantidades abaixo em UN.</small>
      </div>}
      <fieldset><legend>Distribuição ({['FD', 'CX'].includes(item.position.product.defaultUnit) ? 'UN' : item.position.product.defaultUnit})</legend><div className="review-destinations">{destinations.map((destination) => <label key={destination.id}>{destination.name}<input inputMode="numeric" type="number" min="0" step="1" value={item.distributions[destination.id] ?? ''} placeholder="0" onChange={(event) => updateItem(item.key, (current) => ({ ...current, distributions: { ...current.distributions, [destination.id]: event.target.value } }))} /></label>)}</div></fieldset>
      <p className={`distribution-feedback ${complete ? 'complete' : 'incomplete'}`} role="status">{feedback}<span>Distribuido: {state.distributed} / {state.reviewed}</span></p>
    </article>;
  }

  if (loading) return <LoadingState label="Preparando revisao de produtos" />;

  return <>
    <PageHeader
      eyebrow="Classificacao"
      title="Revisar produtos"
      description="Distribua integralmente a quantidade revisada entre os destinos permitidos."
    />
    <OperationGuide review />
    {error && !adding && <Notice kind="error" onClose={() => setError('')}>{error}</Notice>}

    <section className="surface list-panel">
      <div className="panel-heading item-list-heading"><h2>Produtos ({items.length})</h2><button type="button" onClick={() => { setDraft(null); setProductId(''); setBatchId(''); setError(''); setAdding(true); }}>Adicionar produto</button></div>
      {items.length === 0 ? <EmptyState title="Nenhum item adicionado" description="Use Adicionar produto para selecionar o lote e distribuir a quantidade." /> : <ul className="movement-detail-items">{items.map((item) => <li key={item.key}>
        <strong>{item.position.product.code} — {item.position.product.name}</strong>
        <span>Lote {item.position.batch.code} · validade {formatDate(item.position.batch.expirationDate)}</span>
        <span>{item.quantity} {item.position.product.defaultUnit}{item.outputProductId && ` → ${itemState(item).reviewed} UN de ${item.position.product.unitProducts?.find((product) => product.id === item.outputProductId)?.code}`}</span>
        {destinations.filter((destination) => Number(item.distributions[destination.id]) > 0).map((destination) => <span key={destination.id}>{destination.name}: {item.distributions[destination.id]}</span>)}
        <div className="row-actions"><button type="button" className="secondary" onClick={() => { setDraft({ ...item, distributions: { ...item.distributions } }); setAdding(true); }}>Editar item</button><button type="button" className="secondary" onClick={() => setItems((current) => current.filter((candidate) => candidate.key !== item.key))}>Remover</button></div>
      </li>)}</ul>}
      <label className="review-observation">Observação (opcional)<textarea value={observation} onChange={(event) => setObservation(event.target.value)} maxLength={1000} rows={3} /></label>
    </section>
    {adding && <Modal labelledBy="review-item-title" onClose={closeItem}>
      <div className="panel-heading item-list-heading"><h2 id="review-item-title">{draft && items.some((item) => item.key === draft.key) ? 'Editar produto' : 'Adicionar produto'}</h2><button type="button" className="secondary" onClick={closeItem}>Cancelar</button></div>
      {error && <Notice kind="error">{error}</Notice>}
      {!draft ? <>      {positions.length === 0 ? <EmptyState title="Nenhum saldo em Revisar" description="Registre uma entrada em Revisar antes de iniciar esta operacao." /> : <div className="form-grid">
        <ProductAutocomplete availableProducts={products} initialProduct={selectedProduct} onChange={(selected) => { setProductId(selected?.id ?? ''); setBatchId(''); }} />
        <PositionSelect label="Lote *" value={batchId} onChange={setBatchId} disabled={!productId}
          options={productPositions.map((position) => ({ value: position.batchId, label: `Lote: ${position.batch.code} · val: ${formatDate(position.batch.expirationDate)} · saldo: ${position.quantity}` }))} />
        {selectedPosition && <div className="available-balance" role="status"><span>Disponivel em Revisar</span><strong>{selectedPosition.quantity} {selectedPosition.product.defaultUnit}</strong><small>Validade {formatDate(selectedPosition.batch.expirationDate)}</small></div>}
        <div className="form-actions"><button type="button" onClick={addSelected}>+ Adicionar produto/lote</button></div>
      </div>}
</> : <>{renderEditor(draft)}<div className="dialog-actions"><button type="button" className="secondary" disabled={items.some((item) => item.key === draft.key)} onClick={() => setDraft(null)}>Trocar produto/lote</button><button type="button" disabled={!itemReady(draft)} onClick={() => { setItems((current) => current.some((item) => item.key === draft.key) ? current.map((item) => item.key === draft.key ? draft : item) : [...current, draft]); closeItem(); }}>Salvar item</button></div></>}
    </Modal>}
    {!ready && <p className="action-hint">Adicione um item e complete a distribuição para conferir a revisão.</p>}<section className="surface review-submit"><div><span>Total revisado</span><strong>{totalReviewed} em {items.length} produto(s)/lote(s)</strong></div><button disabled={!ready || busy} onClick={() => { submission.resetConfirmation(); setConfirming(true); }}>Revisar operacao</button></section>
    {confirming && <Modal labelledBy="review-confirm-title" busy={busy} onClose={() => setConfirming(false)}><p className="eyebrow">Resumo</p><h2 id="review-confirm-title">{submission.conflict ? 'Mesmo lote com outra validade' : 'Confirmar revisão?'}</h2>{submission.conflict && <Notice kind="info">{submission.conflict.message}</Notice>}{submission.error && <Notice kind="error">{submission.error}</Notice>}<p>{items.length} produto(s)/lote(s), total revisado de <strong>{totalReviewed}</strong>.</p><ul className="review-summary">{items.map((item) => <li key={item.key}><strong>{item.position.product.name} / lote {item.position.batch.code} / validade {formatDate(item.position.batch.expirationDate)}: {item.quantity} {item.position.product.defaultUnit}</strong>{item.outputProductId && <p>→ {itemState(item).reviewed} UN de {item.position.product.unitProducts?.find((product) => product.id === item.outputProductId)?.code} — {item.position.product.unitProducts?.find((product) => product.id === item.outputProductId)?.name}</p>}<ul>{destinations.map((destination) => ({ destination, quantity: Number(item.distributions[destination.id] || 0) })).filter(({ quantity }) => quantity > 0).map(({ destination, quantity }) => <li key={destination.id}>{quantity} → {destination.name}</li>)}</ul></li>)}</ul><p>A quantidade sera retirada de Revisar e distribuida integralmente em uma unica operacao.</p><div className="dialog-actions"><button className="secondary" disabled={busy} onClick={() => setConfirming(false)}>Voltar e corrigir</button><button disabled={busy} onClick={() => void submit()}>{busy ? 'Processando revisao...' : submission.conflict ? 'Confirmar com validades separadas' : 'Confirmar revisao'}</button></div></Modal>}
  </>;
}
