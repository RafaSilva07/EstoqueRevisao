import { FormEvent, useEffect, useState } from 'react';
import { api, Paginated, Product, StockPosition } from './api';
import { LoadingState, Modal, Notice, PageHeader } from './components';
import { OperationalLotFields } from './OperationalLotFields';
import { emptyLot, OperationalLot } from './operational-lot';
import { formatDate } from './format';
import { useMovementSubmission } from './useMovementSubmission';
import { Sector, sectorLabel } from './shipments';

interface DraftItem { key: string; product: Product; lot: OperationalLot; quantity: number; position?: StockPosition }

export function NewShipment({ sector, onCreated, onClose }: { sector: Sector; onCreated: (id: string) => void; onClose: () => void }) {
  const outgoing = sector === 'REVISAO';
  const [destination, setDestination] = useState<Sector>(outgoing ? 'PRODUCAO' : 'REVISAO');
  const [products, setProducts] = useState<Product[]>([]);
  const [positions, setPositions] = useState<StockPosition[]>([]);
  const [search, setSearch] = useState('');
  const [productId, setProductId] = useState('');
  const [positionId, setPositionId] = useState('');
  const [positionPage, setPositionPage] = useState(1);
  const [positionPages, setPositionPages] = useState(1);
  const [quantity, setQuantity] = useState('');
  const [lot, setLot] = useState(emptyLot);
  const [ready, setReady] = useState(false);
  const [lotKey, setLotKey] = useState(0);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const submission = useMovementSubmission('/shipments', onCreated);
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      void api.get<Paginated<Product>>(`/products?limit=100&active=true&search=${encodeURIComponent(search)}`)
        .then((result) => { if (active) { setProducts(result.items); setError(''); } })
        .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : 'Erro ao consultar produtos.'); })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [search]);
  useEffect(() => {
    if (!outgoing || !productId) return;
    let active = true;
    void api.get<Paginated<StockPosition>>(`/stock-positions?productId=${productId}&page=${positionPage}&limit=20`)
      .then((result) => { if (active) { setPositions(result.items); setPositionPages(result.meta.totalPages); } })
      .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : 'Erro ao consultar saldo.'); });
    return () => { active = false; };
  }, [outgoing, productId, positionPage]);
  const product = products.find((item) => item.id === productId);
  const position = positions.find((item) => item.id === positionId);
  function resetLot() { setLot(emptyLot); setReady(false); setLotKey((value) => value + 1); }
  function add(event: FormEvent) {
    event.preventDefault();
    const amount = Number(quantity);
    if (!product || !Number.isSafeInteger(amount) || amount < 1) { setError('Selecione produto e quantidade inteira positiva.'); return; }
    if (outgoing && (!position || amount > position.quantity || items.some((item) => item.position?.id === position.id))) {
      setError('Selecione uma posição não repetida e respeite o saldo disponível.'); return;
    }
    if (!outgoing && (!ready || !lot.expirationDate || lot.expirationDate < lot.manufacturingDate)) { setError('Confira lote, fabricação e validade.'); return; }
    setItems((current) => [...current, { key: crypto.randomUUID(), product, lot: outgoing ? position!.batch : { ...lot }, quantity: amount, position: outgoing ? position : undefined }]);
    setQuantity(''); setPositionId(''); resetLot(); setError('');
  }
  const summary = <ul className="movement-detail-items">{items.map((item) => <li key={item.key}>
    <strong>{item.product.code} — {item.product.name}</strong><span>Lote {item.lot.code} · fabricação {formatDate(item.lot.manufacturingDate)}</span>
    <span>Validade {formatDate(item.lot.expirationDate)}{item.position ? ` · ${item.position.stockLocation.name}` : ''}</span>
    <b>{item.quantity} {item.product.defaultUnit}</b>
    {!confirming && <button className="secondary" onClick={() => setItems((current) => current.filter((draft) => draft.key !== item.key))}>Remover item</button>}
  </li>)}</ul>;
  return <>
    <PageHeader eyebrow="Envios entre setores" title={outgoing ? 'Novo envio' : 'Novo envio para Revisão'} action={<button className="secondary" onClick={onClose}>Voltar</button>} />
    {error && <Notice kind="error">{error}</Notice>}
    <section className="surface form-panel"><h2>1. Destino</h2>{outgoing ? <label>Enviar para<select value={destination} onChange={(event) => setDestination(event.target.value as Sector)}><option value="PRODUCAO">Produção</option><option value="EXPEDICAO">Expedição</option></select></label> : <p>Revisão · entrada em A Revisar somente após confirmação.</p>}
      {outgoing && <p className="muted">Ao enviar, a quantidade sai do disponível e fica em trânsito. Uma recusa devolve o saldo à posição original.</p>}</section>
    <section className="surface form-panel"><h2>2. Adicionar produtos</h2>
      <label>Buscar produto<input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setProductId(''); setPositions([]); setPositionId(''); }} placeholder="Código ou descrição" /></label>
      {loading ? <LoadingState label="Carregando produtos" /> : <form className="form-grid" onSubmit={add}>
        <label className="wide">Produto *<select required value={productId} onChange={(event) => { setProductId(event.target.value); setPositionId(''); setPositions([]); setPositionPage(1); resetLot(); }}><option value="">Selecione</option>{products.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</select></label>
        {outgoing && product && <div className="wide"><label>Posição disponível *<select required value={positionId} onChange={(event) => setPositionId(event.target.value)}><option value="">Selecione lote, validade e local</option>{positions.map((item) => <option key={item.id} value={item.id}>{item.batch.code} · validade {formatDate(item.batch.expirationDate)} · {item.stockLocation.name} · saldo {item.quantity}</option>)}</select></label>
          {positionPages > 1 && <div className="row-actions"><button type="button" className="secondary" disabled={positionPage === 1} onClick={() => { setPositionPage((value) => value - 1); setPositionId(''); setPositions([]); }}>Posições anteriores</button><span>{positionPage}/{positionPages}</span><button type="button" className="secondary" disabled={positionPage >= positionPages} onClick={() => { setPositionPage((value) => value + 1); setPositionId(''); setPositions([]); }}>Próximas posições</button></div>}
          {position && <p>Fabricação {formatDate(position.batch.manufacturingDate)} · disponível: {position.quantity} {product.defaultUnit}</p>}</div>}
        {!outgoing && product && <OperationalLotFields key={`${product.id}:${lotKey}`} product={product} value={lot} onChange={setLot} onReady={setReady} resolvePath="/shipments/resolve-lot" />}
        <label>Quantidade *<input required type="number" inputMode="numeric" min="1" step="1" max={position?.quantity} value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
        <div className="form-actions"><button disabled={!product || items.length >= 100 || (outgoing ? !position : !ready)}>Adicionar item</button></div>
      </form>}
    </section>
    <section className="surface form-panel"><h2>3. Conferir envio ({items.length} itens)</h2>{summary}
      <button disabled={!items.length} onClick={() => { submission.resetConfirmation(); setConfirming(true); }}>Conferir e enviar</button></section>
    {confirming && <Modal labelledBy="shipment-summary-title" busy={submission.busy} onClose={() => setConfirming(false)}>
      <h2 id="shipment-summary-title">{sectorLabel[sector]} → {sectorLabel[destination]}</h2>{summary}
      <p>Após enviar, os itens não poderão ser editados. O destinatário confirmará ou recusará o recebimento.</p>
      {submission.conflict && <Notice kind="info">{submission.conflict.message}</Notice>}
      {submission.error && <Notice kind="error">{submission.error}</Notice>}
      <div className="dialog-actions"><button className="secondary" disabled={submission.busy} onClick={() => setConfirming(false)}>Voltar para conferir</button><button disabled={submission.busy} onClick={() => void submission.submit({ destinationSector: destination, items: items.map((item) => ({ productId: item.product.id, quantity: item.quantity, ...(item.position ? { batchId: item.position.batchId, stockLocationId: item.position.stockLocationId } : { lot: item.lot }) })) })}>{submission.busy ? 'Enviando…' : submission.conflict ? 'Confirmar validade diferente e enviar' : 'Enviar ao destinatário'}</button></div>
    </Modal>}
  </>;
}
