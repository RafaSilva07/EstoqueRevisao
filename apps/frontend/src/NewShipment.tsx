import { PositionSelect } from './PositionSelect';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, Paginated, Product, ShipmentPhotoLimits, StockPosition } from './api';
import { LoadingState, Modal, Notice, PageHeader } from './components';
import { DraftActions } from './FormDrafts';
import { useFormDraft } from './useFormDraft';
import { OperationalLotFields } from './OperationalLotFields';
import { ProductAutocomplete } from './ProductAutocomplete';
import { emptyLot, OperationalLot } from './operational-lot';
import { formatDate } from './format';
import { useMovementSubmission } from './useMovementSubmission';
import { ShipmentLoadingStatus, ShipmentSector, sectorLabel } from './shipments';
import { allShipmentPhotosReady, PhotoAttachment } from './shipment-photo-state';
import { ShipmentPhotoInput } from './ShipmentPhotoInput';
import { AssemblyDraft, AssemblyItemForm } from './AssemblyItemForm';

interface DraftItem { key: string; product: Product; lot: OperationalLot; quantity: number; observation: string | null; position?: StockPosition; assembly?: AssemblyDraft; photos: PhotoAttachment[] }

export function NewShipment({ sector, onCreated, onClose }: { sector: ShipmentSector; onCreated: (id: string) => void; onClose: () => void }) {
  const outgoing = sector === 'REVISAO';
  const [destination, setDestination] = useState<ShipmentSector>(outgoing ? 'PRODUCAO' : 'REVISAO');
  const [loadingStatus, setLoadingStatus] = useState<ShipmentLoadingStatus | ''>('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [assemblyMode, setAssemblyMode] = useState(false);
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
  const [photoLimits, setPhotoLimits] = useState<ShipmentPhotoLimits | null>(null);
  const photoUrls = useRef(new Set<string>());
  const submission = useMovementSubmission('/shipments', created);
  const [productQuery, setProductQuery] = useState({ code: '', name: '' });
  const draft = useFormDraft(`shipment:${sector}`, 'Novo envio', { destination, positionPage, loadingStatus, vehiclePlate, assemblyMode, product, positionId, batchCode, manufacturingDate, quantity, itemObservation, observation, lot, ready, items, requestKey: submission.requestKey, productQuery }, (saved) => {
    setProductQuery(saved.productQuery); setDestination(saved.destination); setPositionPage(saved.positionPage); setLoadingStatus(saved.loadingStatus); setVehiclePlate(saved.vehiclePlate); setAssemblyMode(saved.assemblyMode); setProduct(saved.product); setPositionId(saved.positionId); setBatchCode(saved.batchCode); setManufacturingDate(saved.manufacturingDate); setQuantity(saved.quantity); setItemObservation(saved.itemObservation); setObservation(saved.observation); setLot(saved.lot); setReady(saved.ready); setItems(saved.items); submission.setRequestKey(saved.requestKey);
  }, { busy: submission.busy });
  async function created(id: string) { await draft.complete(); onCreated(id); }
  const canQueryPositions = outgoing && Boolean(product) && Boolean(batchCode.trim() || manufacturingDate);
  const allPhotosReady = allShipmentPhotosReady(items, photoLimits);
  const photoTotal = items.reduce((sum, item) => sum + item.photos.length, 0);
  const loadingReady = sector !== 'EXPEDICAO' || (loadingStatus !== '' && (loadingStatus !== 'CARREGADO' || vehiclePlate.trim().length > 0));

  useEffect(() => () => { photoUrls.current.forEach((url) => URL.revokeObjectURL(url)); }, []);

  useEffect(() => {
    let active = true;
    void api.get<ShipmentPhotoLimits>('/settings/shipment-photos').then((limits) => { if (active) setPhotoLimits(limits); })
      .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : 'Não foi possível carregar os limites de fotos.'); });
    return () => { active = false; };
  }, []);

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
  function resetItem() { setProductQuery({ code: '', name: '' }); setAdding(false); setError(''); clearProduct(); resetLot(); setQuantity(''); setItemObservation(''); }
  function closeItem() { draft.close(() => { setAdding(false); setError(''); }); }

  function add(event: FormEvent) {
    event.preventDefault();
    const amount = Number(quantity);
    if (!product || !Number.isSafeInteger(amount) || amount < 1) { setError('Selecione produto e quantidade inteira positiva.'); return; }
    if (outgoing && (!position || amount > position.quantity || items.some((item) => item.position?.id === position.id))) {
      setError('Selecione uma posição não repetida e respeite o saldo disponível.'); return;
    }
    if (!outgoing && (!ready || !lot.expirationDate || lot.expirationDate < lot.manufacturingDate)) { setError('Confira lote, fabricação e validade.'); return; }
    setItems((current) => [...current, { key: crypto.randomUUID(), product, lot: outgoing ? position!.batch : { ...lot }, quantity: amount,
      observation: itemObservation.trim() || null, position: outgoing ? position : undefined, photos: [] }]);
    resetItem();
  }
  function clearProduct() {
    setProductQuery({ code: '', name: '' });
    lotResolutionVersion.current += 1;
    setLotResolving(false);
    setProduct(null);
    setProductResetKey((value) => value + 1);
    setBatchCode('');
    setManufacturingDate('');
    setPositionId('');
    setPositions([]);
  }
  function attachPhotos(key: string, files: File[]) {
    const photos = files.map((file) => ({ file, url: URL.createObjectURL(file) }));
    photos.forEach((photo) => photoUrls.current.add(photo.url));
    setItems((current) => current.map((item) => item.key === key ? { ...item, photos: [...item.photos, ...photos] } : item));
  }
  function removePhoto(key: string, index: number) {
    setItems((current) => current.map((item) => {
      if (item.key !== key) return item;
      const removed = item.photos[index];
      if (removed) { URL.revokeObjectURL(removed.url); photoUrls.current.delete(removed.url); }
      return { ...item, photos: item.photos.filter((_, photoIndex) => photoIndex !== index) };
    }));
  }
  function removeItem(key: string) {
    setItems((current) => current.filter((item) => {
      if (item.key !== key) return true;
      item.photos.forEach((photo) => { URL.revokeObjectURL(photo.url); photoUrls.current.delete(photo.url); });
      return false;
    }));
  }
  function addAssemblyItem(unit: Product, assembly: AssemblyDraft, itemNote: string) {
    setItems((current) => [...current, { key: crypto.randomUUID(), product: unit, lot: assembly.sources[0].position.batch,
      quantity: assembly.packageQuantity, observation: itemNote || null, assembly, photos: [] }]);
    setAdding(false); setError('');
  }
  const summary = <ul className="movement-detail-items shipment-items">{items.map((item) => <li className="shipment-item-card" key={item.key}>
    <div className="shipment-item-heading"><strong>{item.assembly?.packageProduct.code ?? item.product.code} — {item.assembly?.packageProduct.name ?? item.product.name}</strong><b>{item.quantity} {item.assembly?.packageProduct.defaultUnit ?? item.product.defaultUnit}</b></div>
    <div className="shipment-item-data"><span>{item.assembly?.mixedDates ? 'Lote 0 · datas misturadas' : `Lote ${item.lot.code} · fabricação ${formatDate(item.lot.manufacturingDate)}`}</span>
      {!item.assembly?.mixedDates && <span>Validade {formatDate(item.lot.expirationDate)}{item.position ? ` · ${item.position.stockLocation.name}` : ''}</span>}
      {item.assembly && <span>Montagem: {item.assembly.sources.reduce((sum, source) => sum + source.quantity, 0)} UN de {item.product.code}. Origens: {item.assembly.sources.map((source) => `${source.position.stockLocation.name} / ${source.position.batch.code}: ${source.quantity} UN`).join('; ')}</span>}
      {item.observation && <span><strong>Observação do produto:</strong> {item.observation}</span>}
    </div>
    {photoLimits && <ShipmentPhotoInput photos={item.photos} limits={photoLimits} productName={item.assembly?.packageProduct.name ?? item.product.name}
      remainingTotal={100 - photoTotal} onAdd={(files) => attachPhotos(item.key, files)} onRemove={(index) => removePhoto(item.key, index)} readOnly={confirming} />}
    {!confirming && <button type="button" className="secondary" onClick={() => removeItem(item.key)}>Remover item</button>}
  </li>)}</ul>;
  if (!draft.ready) return <LoadingState label="Recuperando rascunho do envio" />;
  return <>
    <PageHeader eyebrow="Envios entre setores" title={outgoing ? 'Novo envio' : 'Novo envio para Revisão'} action={<button className="secondary" onClick={() => draft.close(onClose)}>Voltar</button>} />
    <DraftActions draft={draft} />
    {error && !adding && <Notice kind="error" onClose={() => setError('')}>{error}</Notice>}
    <section className="surface form-panel"><h2>1. Destino</h2>{outgoing ? <label>Enviar para<select value={destination} disabled={items.length > 0} onChange={(event) => { setDestination(event.target.value as ShipmentSector); setAssemblyMode(false); }}><option value="PRODUCAO">Produção</option><option value="EXPEDICAO">Expedição</option></select></label> : <p>Revisão · entrada em A Revisar somente após confirmação.</p>}
      {sector === 'EXPEDICAO' && <div className="form-grid"><label>Carregamento *<select required value={loadingStatus} onChange={(event) => { setLoadingStatus(event.target.value as ShipmentLoadingStatus | ''); setVehiclePlate(''); }}><option value="">Selecione</option><option value="CARREGADO">Carregado</option><option value="NAO_CARREGADO">Não carregado</option></select></label>
        {loadingStatus === 'CARREGADO' && <label>Placa do veículo *<input required value={vehiclePlate} onChange={(event) => setVehiclePlate(event.target.value.toUpperCase())} maxLength={20} autoCapitalize="characters" placeholder="Informe a placa" /></label>}</div>}
      {outgoing && destination === 'EXPEDICAO' && <label className="assembly-mixed-toggle"><input type="checkbox" checked={assemblyMode} disabled={items.length > 0} onChange={(event) => setAssemblyMode(event.target.checked)} /> Montar fardos/caixas com unidades disponíveis</label>}
      {outgoing && <p className="muted">Ao enviar, a quantidade sai do disponível e fica em trânsito. Uma recusa devolve o saldo à posição original.</p>}</section>
    {adding && <Modal labelledBy="add-product-title" onClose={closeItem}><div className="panel-heading item-list-heading"><h2 id="add-product-title">Adicionar produto</h2><button type="button" className="secondary" onClick={closeItem}>Cancelar</button></div>
      <DraftActions draft={draft} />
      {error && <Notice kind="error">{error}</Notice>}
      {assemblyMode ? <AssemblyItemForm onAdd={addAssemblyItem} excludedPositions={items.flatMap((item) => item.assembly?.sources.map((source) => source.position) ?? [])} /> : <form className="form-grid" onSubmit={add}>
        <ProductAutocomplete draftQuery={productQuery} onQueryChange={setProductQuery} key={productResetKey} initialProduct={product} onChange={changeProduct} />
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
        {!outgoing && product && <OperationalLotFields initiallyResolved={ready} key={`${product.id}:${lotKey}`} product={product} value={lot} onChange={setLot} onReady={setReady} resolvePath="/shipments/resolve-lot" />}
        <label>Quantidade *<input required type="number" inputMode="numeric" min="1" step="1" max={position?.quantity} value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
        <label className="wide">Observação deste produto (opcional)<textarea value={itemObservation} onChange={(event) => setItemObservation(event.target.value)} maxLength={1000} rows={2} /></label>
        <div className="form-actions"><button disabled={!product || items.length >= 100 || (outgoing ? !position : !ready)}>Adicionar item</button></div>
      </form>}
    </Modal>}
    <section className="surface form-panel"><div className="panel-heading item-list-heading"><h2>Produtos ({items.length})</h2><button type="button" onClick={() => { setError(''); setAdding(true); }}>Adicionar produto</button></div>{summary}
      <label>Observação geral do envio (opcional)<textarea value={observation} onChange={(event) => setObservation(event.target.value)} maxLength={1000} rows={3} /></label>
      {!photoLimits && <p className="action-hint">Carregando os limites de fotos…</p>}
      {!allPhotosReady && photoLimits && items.length > 0 && <p className="action-hint photo-required">Adicione de {photoLimits.minimum} a {photoLimits.maximum} foto(s) por produto, até 100 no envio.</p>}
      <button disabled={!allPhotosReady || !loadingReady} onClick={() => { submission.resetConfirmation(); setConfirming(true); }}>Conferir e enviar</button></section>
    {confirming && <Modal labelledBy="shipment-summary-title" busy={submission.busy} onClose={() => draft.close(() => setConfirming(false))}>
      <h2 id="shipment-summary-title">{sectorLabel[sector]} → {sectorLabel[destination]}</h2>{summary}
      {sector === 'EXPEDICAO' && <p><strong>Carregamento:</strong> {loadingStatus === 'CARREGADO' ? `Carregado · placa ${vehiclePlate.trim().toUpperCase()}` : 'Não carregado'}</p>}
      <p>Após enviar, os itens não poderão ser editados. O destinatário confirmará ou recusará o recebimento.</p>
      {submission.conflict && <Notice kind="info">{submission.conflict.message}</Notice>}
      {submission.error && <Notice kind="error">{submission.error}</Notice>}
      {observation.trim() && <p><strong>Observação geral:</strong> {observation.trim()}</p>}
      <div className="dialog-actions"><button className="secondary" disabled={submission.busy} onClick={() => setConfirming(false)}>Voltar para conferir</button><button disabled={submission.busy || !allPhotosReady || !loadingReady} onClick={() => void submission.submit({ destinationSector: destination, observation: observation.trim() || undefined,
        ...(sector === 'EXPEDICAO' ? { loadingStatus, ...(loadingStatus === 'CARREGADO' ? { vehiclePlate: vehiclePlate.trim().toUpperCase() } : {}) } : {}),
        items: items.map((item) => ({ productId: item.product.id, quantity: item.quantity, observation: item.observation ?? undefined, photoCount: item.photos.length,
        ...(item.assembly ? { assembly: { packageProductId: item.assembly.packageProduct.id, mixedDates: item.assembly.mixedDates,
          sources: item.assembly.sources.map((source) => ({ batchId: source.position.batchId, stockLocationId: source.position.stockLocationId, quantity: source.quantity })) } }
          : item.position ? { batchId: item.position.batchId, stockLocationId: item.position.stockLocationId } : { lot: item.lot }) })) }, items.flatMap((item) => item.photos.map((photo) => photo.file)))}>{submission.busy ? 'Enviando…' : submission.conflict ? 'Confirmar validade diferente e enviar' : 'Enviar ao destinatário'}</button></div>
    </Modal>}
  </>;
}
