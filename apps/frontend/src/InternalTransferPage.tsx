import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api, Paginated, Product, StockLocation, StockPosition } from './api';
import { EmptyState, LoadingState, Modal, Notice, OperationGuide, PageHeader } from './components';
import { formatDate } from './format';
import { OperationalLotFields } from './OperationalLotFields';
import { emptyLot, OperationalLot } from './operational-lot';
import { useMovementSubmission } from './useMovementSubmission';

export interface TransferPrefill {
  originLocationId: string;
  productId: string;
  batchId: string;
}

interface TransferDraftItem {
  key: string;
  position: StockPosition;
  destinationBatch: OperationalLot;
  destinationBatchId?: string;
  quantity: number;
}

const messageFrom = (error: unknown) => error instanceof Error
  ? error.message
  : 'Ocorreu um erro inesperado.';

export function InternalTransferPage({
  prefill,
  onCreated,
}: {
  prefill?: TransferPrefill;
  onCreated: (id: string) => void;
}) {
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [destinationLot, setDestinationLot] = useState(emptyLot);
  const [lotReady, setLotReady] = useState(false);
  const [lotKey, setLotKey] = useState(0);
  const [changeLot, setChangeLot] = useState(false);
  const [positions, setPositions] = useState<StockPosition[]>([]);
  const [originId, setOriginId] = useState(prefill?.originLocationId ?? '');
  const [destinationId, setDestinationId] = useState('');
  const [productId, setProductId] = useState(prefill?.productId ?? '');
  const [batchId, setBatchId] = useState(prefill?.batchId ?? '');

  const [quantity, setQuantity] = useState('');
  const [observation, setObservation] = useState('');
  const [items, setItems] = useState<TransferDraftItem[]>([]);
  const submission = useMovementSubmission('/movements/internal-transfers', onCreated);
  const busy = submission.busy;
  const [loading, setLoading] = useState(true);
  const [loadingStock, setLoadingStock] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void Promise.all([
        api.get<Paginated<StockLocation>>('/stocks?limit=100&active=true'),
      ])
        .then(([locationData]) => {
          setLocations(locationData.items);
        })
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

  const internalLocations = locations.filter((location) => location.kind !== 'EXTERNAL');
  const products = useMemo(() => {
    const unique = new Map<string, Product>();
    positions.forEach((position) => unique.set(position.productId, position.product));
    return [...unique.values()].sort((left, right) => left.name.localeCompare(right.name));
  }, [positions]);
  const sourcePositions = positions.filter((position) => position.productId === productId);
  const selectedPosition = positions.find(
    (position) => position.productId === productId && position.batchId === batchId,
  );
  const selectedDestinationBatch = changeLot ? (lotReady ? destinationLot : undefined) : selectedPosition?.batch;
  const selectedProduct = products.find((product) => product.id === productId);
  const locationFor = (id: string) => locations.find((location) => location.id === id);

  function changeOrigin(value: string) {
    setOriginId(value);
    setProductId('');
    setBatchId('');
    setChangeLot(false); setDestinationLot(emptyLot); setLotReady(false); setLotKey((key) => key + 1);
  }

  function changeSourceBatch(value: string) {
    setBatchId(value);
    setChangeLot(false); setDestinationLot(emptyLot); setLotReady(false); setLotKey((key) => key + 1);
  }

  function addItem(event: FormEvent) {
    event.preventDefault();
    const numericQuantity = Number(quantity);
    if (
      !selectedPosition
      || !selectedDestinationBatch
      || !selectedDestinationBatch.expirationDate
      || selectedDestinationBatch.expirationDate < selectedDestinationBatch.manufacturingDate
      || !destinationId
      || !Number.isInteger(numericQuantity)
      || numericQuantity <= 0
    ) {
      setError('Selecione origem, destino, lotes e informe uma quantidade inteira positiva.');
      return;
    }
    if (numericQuantity > selectedPosition.quantity) {
      setError(`Saldo insuficiente. Disponivel: ${selectedPosition.quantity}.`);
      return;
    }
    if (originId === destinationId && selectedPosition.batch.code === selectedDestinationBatch.code) {
      setError('A transferencia deve alterar o lote ou o local.');
      return;
    }
    if (items.some((item) => (
      item.position.productId === productId && item.position.batchId === batchId
    ))) {
      setError('Este produto e lote de origem ja foi adicionado. Remova o item para altera-lo.');
      return;
    }
    setItems((current) => [...current, {
      key: crypto.randomUUID(),
      position: selectedPosition,
      destinationBatch: selectedDestinationBatch,
      destinationBatchId: changeLot ? undefined : selectedPosition.batchId,
      quantity: numericQuantity,
    }]);
    setBatchId('');
    setChangeLot(false); setDestinationLot(emptyLot); setLotReady(false); setLotKey((key) => key + 1);
    setQuantity('');
    setError('');
  }

  async function submit() {
    await submission.submit({
      originLocationId: originId, destinationLocationId: destinationId, observation: observation || undefined,
      items: items.map((item) => ({
        productId: item.position.productId, batchId: item.position.batchId, quantity: item.quantity,
        ...(item.destinationBatchId ? { destinationBatchId: item.destinationBatchId } : { destinationLot: item.destinationBatch }),
      })),
    });
  }

  if (loading) return <LoadingState label="Preparando nova transferencia" />;

  const routeLocked = items.length > 0;
  return <>
    <PageHeader
      eyebrow="Movimentacao"
      title="Transferência interna"
      description="Mova o produto para outro local, outro lote ou ambos sem alterar a quantidade total."
    />
    <OperationGuide />
    {error && <Notice kind="error" onClose={() => setError('')}>{error}</Notice>}
    <section className="surface form-panel">
      <h2><span className="step-number">1</span> Origem e destino</h2>
      <div className="form-grid">
        <label><span>Local de origem <span className="required">*</span></span>
          <select value={originId} onChange={(event) => changeOrigin(event.target.value)} disabled={routeLocked} required>
            <option value="">Selecione</option>
            {internalLocations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
          </select>
        </label>
        <label><span>Local de destino <span className="required">*</span></span>
          <select value={destinationId} onChange={(event) => setDestinationId(event.target.value)} disabled={routeLocked || !originId} required>
            <option value="">Selecione</option>
            {internalLocations.map((location) => <option key={location.id} value={location.id}>{location.name}{location.id === originId ? ' (mesmo local)' : ''}</option>)}
          </select>
          <small>O mesmo local e permitido quando o lote de destino for diferente.</small>
        </label>
        {routeLocked && <p className="route-lock-note wide">Remova os itens para alterar os locais.</p>}
        <label className="wide">Observação (opcional)
          <textarea value={observation} onChange={(event) => setObservation(event.target.value)} maxLength={1000} rows={3} />
        </label>
      </div>
    </section>
    <section className="surface form-panel">
      <h2><span className="step-number">2</span> Adicionar item</h2>
      {!originId ? <p className="muted">Escolha a origem para consultar o saldo.</p> : loadingStock ? <LoadingState label="Consultando saldo da origem" /> : positions.length === 0 ? <EmptyState title="Origem sem saldo disponivel" description="Escolha outro local ou registre uma entrada antes da transferencia." /> : <form className="form-grid" onSubmit={addItem}>
        <label><span>Produto <span className="required">*</span></span>
          <select value={productId} onChange={(event) => { setProductId(event.target.value); changeSourceBatch(''); }} required>
            <option value="">Selecione</option>
            {products.map((product) => <option key={product.id} value={product.id}>{product.code} - {product.name}</option>)}
          </select>
        </label>
        <label><span>Lote de origem <span className="required">*</span></span>
          <select value={batchId} onChange={(event) => changeSourceBatch(event.target.value)} disabled={!productId} required>
            <option value="">Selecione</option>
            {sourcePositions.map((position) => <option key={position.id} value={position.batchId}>{position.batch.code} - validade {formatDate(position.batch.expirationDate)} - saldo {position.quantity}</option>)}
          </select>
        </label>
        {selectedPosition && <div className="available-balance" role="status"><span>Disponivel em {locationFor(originId)?.name}</span><strong>{selectedPosition.quantity} {selectedPosition.product.defaultUnit}</strong><small>Validade {formatDate(selectedPosition.batch.expirationDate)}</small></div>}
        <label><span>Quantidade <span className="required">*</span></span>
          <input inputMode="numeric" type="number" min="1" max={selectedPosition?.quantity} step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
        </label>
        <label><span>Lote de destino <span className="required">*</span></span>
          <select value={changeLot ? 'other' : 'keep'} onChange={(event) => { setChangeLot(event.target.value === 'other'); setDestinationLot(emptyLot); setLotReady(false); setLotKey((key) => key + 1); }} disabled={!selectedPosition}>
            <option value="keep">Manter lote e validade da origem</option>
            <option value="other">Informar lote / fabricação e validade de destino</option>
          </select>
          <small>Informe os dados do destino; se já existirem, o saldo será somado automaticamente.</small>

        </label>
        {changeLot && selectedProduct && <OperationalLotFields key={productId + ':' + lotKey} product={selectedProduct} value={destinationLot} onChange={setDestinationLot} onReady={setLotReady} />}
        <div className="form-actions"><button disabled={changeLot && !lotReady}>+ Adicionar</button></div>
      </form>}
    </section>
    <section className="surface list-panel">
      <h2><span className="step-number">3</span> Itens da transferencia ({items.length})</h2>
      {items.length === 0 ? <EmptyState title="Nenhum item adicionado" description="Adicione ao menos uma posicao de origem e seu lote de destino." /> : <div className="entry-items">{items.map((item) => <article key={item.key} className="entry-item"><div><strong>{item.position.product.name}</strong><span>{locationFor(originId)?.name} / lote {item.position.batch.code} / validade {formatDate(item.position.batch.expirationDate)}</span><span>→ {locationFor(destinationId)?.name} / lote {item.destinationBatch.code} / validade {formatDate(item.destinationBatch.expirationDate)}</span><b>{item.quantity} {item.position.product.defaultUnit}</b></div><button className="secondary" onClick={() => setItems((current) => current.filter((candidate) => candidate.key !== item.key))}>Remover</button></article>)}</div>}
      {(!originId || !destinationId || items.length === 0) && <p className="action-hint">Selecione origem, destino e adicione ao menos um item para continuar.</p>}<button className="button-wide" disabled={!originId || !destinationId || items.length === 0 || busy} onClick={() => { submission.resetConfirmation(); setConfirming(true); }}>Revisar transferencia</button>
    </section>
    {confirming && <Modal labelledBy="transfer-confirm-title" busy={busy} onClose={() => setConfirming(false)}><p className="eyebrow">Confirmacao</p><h2 id="transfer-confirm-title">{submission.conflict ? 'Mesmo lote com outra validade' : 'Confirmar transferência?'}</h2>{submission.conflict && <Notice kind="info">{submission.conflict.message}</Notice>}{submission.error && <Notice kind="error">{submission.error}</Notice>}<ul>{items.map((item) => <li key={item.key}><strong>{item.position.product.name}</strong><br />{locationFor(originId)?.name} / lote {item.position.batch.code} / validade {formatDate(item.position.batch.expirationDate)} → {locationFor(destinationId)?.name} / lote {item.destinationBatch.code} / validade {formatDate(item.destinationBatch.expirationDate)}<br /><strong>{item.quantity} {item.position.product.defaultUnit}</strong></li>)}</ul><p>Total: {items.length} item(ns). O produto e a quantidade total serao preservados.</p><div className="dialog-actions"><button className="secondary" disabled={busy} onClick={() => setConfirming(false)}>Voltar e corrigir</button><button disabled={busy} onClick={() => void submit()}>{busy ? 'Transferindo...' : submission.conflict ? 'Confirmar com validades separadas' : 'Confirmar transferência'}</button></div></Modal>}
  </>;
}
