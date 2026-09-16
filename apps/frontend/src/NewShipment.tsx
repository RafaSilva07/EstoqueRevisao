import { PositionSelect } from './PositionSelect';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, Paginated, Product, StockPosition } from './api';
import { Modal, Notice, PageHeader } from './components';
import { OperationalLotFields } from './OperationalLotFields';
import { ProductAutocomplete } from './ProductAutocomplete';
import { emptyLot, OperationalLot } from './operational-lot';
import { formatDate } from './format';
import { useMovementSubmission } from './useMovementSubmission';
import { Sector, sectorLabel } from './shipments';

interface DraftItem { key: string; product: Product; lot: OperationalLot; quantity: number; observation: string | null; position?: StockPosition }

export function NewShipment({ sector, onCreated, onClose }: { sector: Sector; onCreated: (id: string) => void; onClose: () => void }) {
  const outgoing = sector === 'REVISAO';
  const [destination, setDestination] = useState<Sector>(outgoing ? 'PRODUCAO' : 'REVISAO');
  const [product, setProduct] = useState<Product | null>(null);
  const [productResetKey, setProductResetKey] = useState(0);
  const [positions, setPositions] = useState<StockPosition[]>([]);
  const [positionId, setPositionId] = useState('');
  const [positionPage, setPositionPage] = useState(1);
  const [positionPages, setPositionPages] = useState(1);
  const [positionLoading, setPositionLoading] = useState(false);
  const [batchCode, setBatchCode] = useState('');
  const [manufacturingDate, setManufacturingDate] = useState('');
  const [lotResolving, setLotResolving] = useState(false);
  const lotResolutionVersion = useRef(0);
  const [quantity, setQuantity] = useState('');
  const [itemObservation, setItemObservation] = useState('');
  const [observation, setObservation] = useState('');
  const [lot, setLot] = useState(emptyLot);
  const [ready, setReady] = useState(false);
  const [lotKey, setLotKey] = useState(0);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const submission = useMovementSubmission('/shipments', onCreated);
  const canQueryPositions = outgoing && Boolean(product) && Boolean(batchCode.trim() || manufacturingDate);

  useEffect(() => {
    if (!canQueryPositions || !product) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setPositionLoading(true);
      const query = new URLSearchParams({ productId: product.id, page: String(positionPage), limit: '20' });
      if (batchCode.trim()) query.set('batchCode', batchCode.trim());
      if (manufacturingDate) query.set('manufacturingDate', manufacturingDate);
      void api.get<Paginated<StockPosition>>(`/shipments/available-positions?${query}`)
        .then((result) => {
          if (!active) return;
          setPositions(result.items);
          setPositionPages(result.meta.totalPages);
          setError('');
        })
        .catch((caught: unknown) => {
          if (active) {
            setPositions([]);
            setPositionPages(1);
            setError(caught instanceof Error ? caught.message : 'Erro ao consultar saldo disponível.');
          }
        })
        .finally(() => { if (active) setPositionLoading(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [batchCode, canQueryPositions, manufacturingDate, positionPage, product]);

  const visiblePositions = canQueryPositions ? positions : [];
  const isPositionLoading = canQueryPositions && positionLoading;
  const position = visiblePositions.find((item) => item.id === positionId);
  function resetLot() { setLot(emptyLot); setReady(false); setLotKey((value) => value + 1); }
  function changeProduct(selected: Product | null) {
    lotResolutionVersion.current += 1;
    setLotResolving(false);
    setProduct(selected);
    setBatchCode('');
    setManufacturingDate('');
    setPositionId('');
    setPositionPage(1);
    setPositions([]);
    resetLot();
  }
  function selectPosition(id: string) {
    lotResolutionVersion.current += 1;
    setLotResolving(false);
    setPositionId(id);
    const selected = visiblePositions.find((item) => item.id === id);
    if (selected) {
      setBatchCode(selected.batch.code);
      setManufacturingDate(selected.batch.manufacturingDate);
    }
  }
  async function resolveLot(field: 'code' | 'manufacturingDate', input: string) {
    if (!product || (field === 'code' && !/^[CONSERVADI]{6}$/.test(input)) || !input) return;
    const version = ++lotResolutionVersion.current;
    setLotResolving(true);
    try {
      const resolved = await api.post<{ code: string; manufacturingDate: string }>('/shipments/resolve-lot', {
        productId: product.id,
        [field]: input,
      });
      if (version !== lotResolutionVersion.current) return;
      setBatchCode(resolved.code);
      setManufacturingDate(resolved.manufacturingDate);
      setPositionId('');
      setPositionPage(1);
      setError('');
    } catch (caught: unknown) {
      if (version === lotResolutionVersion.current) {
        setError(caught instanceof Error ? caught.message : 'Não foi possível completar lote e fabricação.');
      }
    } finally {
      if (version === lotResolutionVersion.current) setLotResolving(false);
    }
  }
  function changeBatchCode(input: string) {
    const code = input.toLocaleUpperCase('pt-BR');
    lotResolutionVersion.current += 1;
    setLotResolving(false);
    setBatchCode(code);
    setManufacturingDate('');
    setPositionId('');
    setPositionPage(1);
    void resolveLot('code', code);
  }
  function changeManufacturingDate(date: string) {
    lotResolutionVersion.current += 1;
    setLotResolving(false);
    setManufacturingDate(date);
    setBatchCode('');
    setPositionId('');
    setPositionPage(1);
    void resolveLot('manufacturingDate', date);
  }
  function closeItem() { setAdding(false); setError(''); clearProduct(); resetLot(); setQuantity(''); setItemObservation(''); }

  function add(event: FormEvent) {
    event.preventDefault();
    const amount = Number(quantity);
    if (!product || !Number.isSafeInteger(amount) || amount < 1) { setError('Selecione produto e quantidade inteira positiva.'); return; }
    if (outgoing && (!position || amount > position.quantity || items.some((item) => item.position?.id === position.id))) {
      setError('Selecione uma posição não repetida e respeite o saldo disponível.'); return;
    }
    if (!outgoing && (!ready || !lot.expirationDate || lot.expirationDate < lot.manufacturingDate)) { setError('Confira lote, fabricação e validade.'); return; }
    setItems((current) => [...current, { key: crypto.randomUUID(), product, lot: outgoing ? position!.batch : { ...lot }, quantity: amount,
      observation: itemObservation.trim() || null, position: outgoing ? position : undefined }]);
    closeItem();
  }
  function clearProduct() {
    lotResolutionVersion.current += 1;
    setLotResolving(false);
    setProduct(null);
    setProductResetKey((value) => value + 1);
    setBatchCode('');
    setManufacturingDate('');
    setPositionId('');
    setPositions([]);
  }
  const summary = <ul className="movement-detail-items">{items.map((item) => <li key={item.key}>
    <strong>{item.product.code} — {item.product.name}</strong><span>Lote {item.lot.code} · fabricação {formatDate(item.lot.manufacturingDate)}</span>
    <span>Validade {formatDate(item.lot.expirationDate)}{item.position ? ` · ${item.position.stockLocation.name}` : ''}</span>
    <b>{item.quantity} {item.product.defaultUnit}</b>
    {item.observation && <span><strong>Observação do produto:</strong> {item.observation}</span>}
    {!confirming && <button type="button" className="secondary" onClick={() => setItems((current) => current.filter((draft) => draft.key !== item.key))}>Remover item</button>}
  </li>)}</ul>;
  return <>
    <PageHeader eyebrow="Envios entre setores" title={outgoing ? 'Novo envio' : 'Novo envio para Revisão'} action={<button className="secondary" onClick={onClose}>Voltar</button>} />
    {error && !adding && <Notice kind="error" onClose={() => setError('')}>{error}</Notice>}
    <section className="surface form-panel"><h2>1. Destino</h2>{outgoing ? <label>Enviar para<select value={destination} onChange={(event) => setDestination(event.target.value as Sector)}><option value="PRODUCAO">Produção</option><option value="EXPEDICAO">Expedição</option></select></label> : <p>Revisão · entrada em A Revisar somente após confirmação.</p>}
      {outgoing && <p className="muted">Ao enviar, a quantidade sai do disponível e fica em trânsito. Uma recusa devolve o saldo à posição original.</p>}</section>
    {adding && <Modal labelledBy="add-product-title" onClose={closeItem}><div className="panel-heading item-list-heading"><h2 id="add-product-title">Adicionar produto</h2><button type="button" className="secondary" onClick={closeItem}>Cancelar</button></div>
      {error && <Notice kind="error">{error}</Notice>}
      <form className="form-grid" onSubmit={add}>
        <ProductAutocomplete key={productResetKey} onChange={changeProduct} />
        {product && <div className="selected-product wide"><strong>Produto selecionado: {product.code}</strong><span>{product.name} · {product.defaultUnit}</span><button type="button" className="secondary" onClick={clearProduct}>Trocar produto</button></div>}
        {outgoing && product && <fieldset className="shipment-position-filter wide"><legend>Lote e posição disponível</legend>
          <p className="muted">Informe o lote ou a fabricação. Depois escolha a posição; Lata Boa aparece primeiro por ser a origem prioritária dos envios externos.</p>
          <div className="form-grid">
            <label>Lote<input value={batchCode} maxLength={6} autoCapitalize="characters" spellCheck={false} onChange={(event) => changeBatchCode(event.target.value)} placeholder="Digite o lote" /></label>
            <label>Fabricação<input type="date" min="2000-01-01" max="2099-12-31" value={manufacturingDate} onChange={(event) => changeManufacturingDate(event.target.value)} /></label>
            {lotResolving && <p className="wide" role="status">Completando lote e fabricação…</p>}
            <PositionSelect label="Posição disponível *" disabled={isPositionLoading || !canQueryPositions} value={positionId} onChange={selectPosition}
              placeholder={isPositionLoading ? 'Consultando posições…' : !canQueryPositions ? 'Informe lote ou fabricação' : visiblePositions.length === 0 ? 'Nenhuma posição disponível' : 'Selecione a posição'}
              options={visiblePositions.map((item) => ({ value: item.id, label: `${item.stockLocation.code === 'LATA_BOA' ? '★ ' : ''}${item.stockLocation.name} · lote: ${item.batch.code} · prod: ${formatDate(item.batch.manufacturingDate)} · val: ${formatDate(item.batch.expirationDate)} · saldo: ${item.quantity}` }))} />
          </div>
          {canQueryPositions && positionPages > 1 && <div className="row-actions shipment-position-pagination"><button type="button" className="secondary" disabled={positionPage === 1 || isPositionLoading} onClick={() => { setPositionPage((value) => value - 1); setPositionId(''); }}>Posições anteriores</button><span>{positionPage}/{positionPages}</span><button type="button" className="secondary" disabled={positionPage >= positionPages || isPositionLoading} onClick={() => { setPositionPage((value) => value + 1); setPositionId(''); }}>Próximas posições</button></div>}
          {position && <p className="available-balance"><span>Posição escolhida: {position.stockLocation.name}</span><strong>{position.quantity} {product.defaultUnit} disponíveis</strong></p>}
        </fieldset>}
        {!outgoing && product && <OperationalLotFields key={`${product.id}:${lotKey}`} product={product} value={lot} onChange={setLot} onReady={setReady} resolvePath="/shipments/resolve-lot" />}
        <label>Quantidade *<input required type="number" inputMode="numeric" min="1" step="1" max={position?.quantity} value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
        <label className="wide">Observação deste produto (opcional)<textarea value={itemObservation} onChange={(event) => setItemObservation(event.target.value)} maxLength={1000} rows={2} /></label>
        <div className="form-actions"><button disabled={!product || items.length >= 100 || (outgoing ? !position : !ready)}>Adicionar item</button></div>
      </form>
    </Modal>}
    <section className="surface form-panel"><div className="panel-heading item-list-heading"><h2>Produtos ({items.length})</h2><button type="button" onClick={() => { setError(''); setAdding(true); }}>Adicionar produto</button></div>{summary}
      <label>Observação geral do envio (opcional)<textarea value={observation} onChange={(event) => setObservation(event.target.value)} maxLength={1000} rows={3} /></label>
      <button disabled={!items.length} onClick={() => { submission.resetConfirmation(); setConfirming(true); }}>Conferir e enviar</button></section>
    {confirming && <Modal labelledBy="shipment-summary-title" busy={submission.busy} onClose={() => setConfirming(false)}>
      <h2 id="shipment-summary-title">{sectorLabel[sector]} → {sectorLabel[destination]}</h2>{summary}
      <p>Após enviar, os itens não poderão ser editados. O destinatário confirmará ou recusará o recebimento.</p>
      {submission.conflict && <Notice kind="info">{submission.conflict.message}</Notice>}
      {submission.error && <Notice kind="error">{submission.error}</Notice>}
      {observation.trim() && <p><strong>Observação geral:</strong> {observation.trim()}</p>}
      <div className="dialog-actions"><button className="secondary" disabled={submission.busy} onClick={() => setConfirming(false)}>Voltar para conferir</button><button disabled={submission.busy} onClick={() => void submission.submit({ destinationSector: destination, observation: observation.trim() || undefined, items: items.map((item) => ({ productId: item.product.id, quantity: item.quantity, observation: item.observation ?? undefined, ...(item.position ? { batchId: item.position.batchId, stockLocationId: item.position.stockLocationId } : { lot: item.lot }) })) })}>{submission.busy ? 'Enviando…' : submission.conflict ? 'Confirmar validade diferente e enviar' : 'Enviar ao destinatário'}</button></div>
    </Modal>}
  </>;
}
