import { FormEvent, useEffect, useState } from 'react';
import { api, Paginated, Product, StockLocation } from './api';
import { EmptyState, LoadingState, Modal, Notice, OperationGuide, PageHeader } from './components';
import { OperationalLotFields } from './OperationalLotFields';
import { emptyLot, OperationalLot } from './operational-lot';
import { useMovementSubmission } from './useMovementSubmission';
import { formatDate } from './format';
import { ProductAutocomplete } from './ProductAutocomplete';

interface EntryItem { key: string; product: Product; lot: OperationalLot; quantity: number }

export function ExternalEntryPage({ onCreated, onManageLocations }: { onCreated: (id: string) => void; onManageLocations: () => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [originLocations, setOriginLocations] = useState<StockLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [originId, setOriginId] = useState('');
  const [destinationId, setDestinationId] = useState('');
  const [productId, setProductId] = useState('');
  const [lot, setLot] = useState(emptyLot);
  const [lotReady, setLotReady] = useState(false);
  const [lotKey, setLotKey] = useState(0);
  const [quantity, setQuantity] = useState('');
  const [observation, setObservation] = useState('');
  const [items, setItems] = useState<EntryItem[]>([]);
  const [confirming, setConfirming] = useState(false);
  const submission = useMovementSubmission('/movements/external-entries', onCreated);
  useEffect(() => {
    let active = true;
    void Promise.all([
      api.get<Paginated<Product>>('/products?limit=100&active=true'),
      api.get<Paginated<StockLocation>>('/stocks?limit=100&active=true'),
      api.get<Paginated<StockLocation>>('/stocks?kind=EXTERNAL&limit=100&active=true'),
    ]).then(([p, l, origins]) => { if (active) { setProducts(p.items); setLocations(l.items); setOriginLocations(origins.items); } })
      .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : 'Erro ao carregar produtos.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const product = products.find((item) => item.id === productId);
  const locationName = (id: string) => originLocations.find((item) => item.id === id)?.name ?? locations.find((item) => item.id === id)?.name;
  function resetLot() { setLot(emptyLot); setLotReady(false); setLotKey((key) => key + 1); }
  function closeItem() { setAdding(false); setError(''); setProductId(''); resetLot(); setQuantity(''); }

  function addItem(event: FormEvent) {
    event.preventDefault();
    if (!product || !lotReady || !lot.expirationDate || lot.expirationDate < lot.manufacturingDate
      || !Number.isSafeInteger(Number(quantity)) || Number(quantity) < 1) {
      setError('Confira lote, fabricação, validade e quantidade inteira positiva.'); return;
    }
    setItems((current) => [...current, { key: crypto.randomUUID(), product, lot: { ...lot }, quantity: Number(quantity) }]);
    closeItem();
  }
  const itemSummary = (item: EntryItem) => <><strong>{item.product.code} — {item.product.name}</strong><span>Lote {item.lot.code} · fabricação {formatDate(item.lot.manufacturingDate)}</span><span>Validade {formatDate(item.lot.expirationDate)} · {item.quantity} {item.product.defaultUnit}</span></>;
  if (loading) return <LoadingState label="Preparando entrada" />;
  return <>
    <PageHeader eyebrow="Movimentação" title="Entrada externa" description="Selecione o produto e informe lote ou fabricação, validade e quantidade." />
    <Notice kind="info">A entrada manual credita o estoque imediatamente, sem confirmação do setor de origem. Para uma entrega acompanhada pelo destinatário, use Envios. Não registre a mesma entrega nos dois fluxos.</Notice>
    <OperationGuide />
    {error && !adding && <Notice kind="error" onClose={() => setError('')}>{error}</Notice>}
    <section className="surface form-panel"><h2>1. Origem e destino</h2><div className="form-grid">
      <label>Origem externa *<select value={originId} onChange={(event) => setOriginId(event.target.value)} required><option value="">Selecione</option>{originLocations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Destino controlado *<select value={destinationId} onChange={(event) => setDestinationId(event.target.value)} required><option value="">Selecione</option>{locations.filter((item) => item.kind !== 'EXTERNAL').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="wide">Observação (opcional)<textarea value={observation} onChange={(event) => setObservation(event.target.value)} maxLength={1000} rows={2} /></label>
    </div>{originLocations.length === 0 && <Notice kind="info">Não há origem externa ativa cadastrada. Cadastre um local do tipo “Origem/destino externo” para continuar. <button type="button" className="secondary" onClick={onManageLocations}>Cadastrar origem externa</button></Notice>}</section>
    {adding && <Modal labelledBy="add-product-title" onClose={closeItem}><div className="panel-heading item-list-heading"><h2 id="add-product-title">Adicionar produto</h2><button type="button" className="secondary" onClick={closeItem}>Cancelar</button></div>
      {error && <Notice kind="error">{error}</Notice>}<form className="form-grid" onSubmit={addItem}>
      <ProductAutocomplete availableProducts={products} initialProduct={product} onChange={(selected) => { setProductId(selected?.id ?? ''); resetLot(); }} />
      {product && <OperationalLotFields key={productId + ':' + lotKey} product={product} value={lot} onChange={setLot} onReady={setLotReady} />}
      <label>Quantidade {product ? '(' + product.defaultUnit + ')' : ''} *<input type="number" inputMode="numeric" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} required /></label>
      <div className="form-actions"><button disabled={!product || !lotReady}>Adicionar item</button></div>
    </form></Modal>}
    <section className="surface list-panel"><div className="panel-heading item-list-heading"><h2>Produtos ({items.length})</h2><button type="button" disabled={submission.busy} onClick={() => { setError(''); setAdding(true); }}>Adicionar produto</button></div>
      {!items.length ? <EmptyState title="Nenhum item adicionado" description="Use Adicionar produto para preencher os dados do item." /> : <div className="entry-items">{items.map((item) => <article className="entry-item" key={item.key}><div>{itemSummary(item)}</div><button className="secondary" onClick={() => setItems((current) => current.filter((candidate) => candidate.key !== item.key))}>Remover</button></article>)}</div>}
      <button className="button-wide" disabled={!originId || !destinationId || !items.length} onClick={() => { submission.resetConfirmation(); setConfirming(true); }}>Revisar e confirmar entrada</button>
    </section>
    {confirming && <Modal labelledBy="entry-title" busy={submission.busy} onClose={() => setConfirming(false)}>
      <h2 id="entry-title">{submission.conflict ? 'Mesmo lote com outra validade' : 'Confirmar entrada?'}</h2>
      <p>{locationName(originId)} → {locationName(destinationId)}</p>
      {originLocations.find((item) => item.id === originId)?.sector && <Notice kind="info">Esta entrada de Produção ou Expedição será efetivada agora, sem Envio nem confirmação do remetente. Confira se a mesma entrega ainda não foi registrada em Envios.</Notice>}
      {submission.conflict && <Notice kind="info">{submission.conflict.message}</Notice>}
      {submission.error && <Notice kind="error">{submission.error}</Notice>}
      <div className="entry-items">{items.map((item) => <article className="entry-item" key={item.key}><div>{itemSummary(item)}</div></article>)}</div>
      <div className="dialog-actions"><button className="secondary" disabled={submission.busy} onClick={() => setConfirming(false)}>Voltar e corrigir</button><button disabled={submission.busy} onClick={() => void submission.submit({
        originLocationId: originId, destinationLocationId: destinationId, observation: observation || undefined,
        items: items.map((item) => ({ productId: item.product.id, lot: item.lot, quantity: item.quantity })),
      })}>{submission.busy ? 'Confirmando…' : submission.conflict ? 'Confirmar com validades separadas' : 'Confirmar entrada'}</button></div>
    </Modal>}
  </>;
}
