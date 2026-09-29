import { FormEvent, useEffect, useState } from 'react';
import { api, Paginated, Product, StockPosition } from './api';
import { Notice } from './components';
import { formatDate } from './format';
import { ProductAutocomplete } from './ProductAutocomplete';

export interface AssemblyDraft {
  packageProduct: Product;
  packageQuantity: number;
  mixedDates: boolean;
  sources: Array<{ position: StockPosition; quantity: number }>;
}

interface AssemblyOptions {
  packages: Product[];
  availableUnits: number;
  availableByBatch: Array<{ batchId: string; code: string; manufacturingDate: string; expirationDate: string; availableUnits: number;
    positions: Array<{ positionId: string; stockLocationName: string; availableUnits: number }> }>;
  positions: Paginated<StockPosition>;
}

export function AssemblyItemForm({ onAdd, excludedPositions }: {
  onAdd: (unit: Product, assembly: AssemblyDraft, observation: string) => void;
  excludedPositions: StockPosition[];
}) {
  const [unit, setUnit] = useState<Product | null>(null);
  const [options, setOptions] = useState<AssemblyOptions | null>(null);
  const [page, setPage] = useState(1);
  const [packageId, setPackageId] = useState('');
  const [packageQuantity, setPackageQuantity] = useState('');
  const [mixedDates, setMixedDates] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [sources, setSources] = useState<Array<{ position: StockPosition; quantity: number }>>([]);
  const [observation, setObservation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!unit || unit.defaultUnit !== 'UN') return;
    let active = true;
    const batchFilter = !mixedDates && selectedBatchId ? `&batchId=${encodeURIComponent(selectedBatchId)}` : '';
    void api.get<AssemblyOptions>(`/shipments/assembly-options?productId=${encodeURIComponent(unit.id)}&page=${page}&limit=20${batchFilter}`)
      .then((result) => { if (active) { setOptions(result); setError(''); } })
      .catch((caught: unknown) => { if (active) { setOptions(null); setError(caught instanceof Error ? caught.message : 'Falha ao consultar unidades.'); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [unit, page, mixedDates, selectedBatchId]);

  const packaged = options?.packages.find((product) => product.id === packageId);
  const factor = packaged?.unitsPerPackage ?? 0;
  const amount = Number(packageQuantity);
  const needed = amount * factor;
  const allocated = sources.reduce((sum, source) => sum + source.quantity, 0);
  const excludedForUnit = [...new Map(excludedPositions.filter((position) => position.productId === unit?.id)
    .map((position) => [position.id, position])).values()];
  const excludedIds = new Set(excludedForUnit.map((position) => position.id));
  const excludedUnits = excludedForUnit
    .reduce((sum, position) => sum + position.quantity, 0);
  const availableByBatch = options?.availableByBatch.map((batch) => ({
    ...batch,
    positions: batch.positions.map((position) => ({ ...position,
      availableUnits: excludedIds.has(position.positionId) ? 0 : position.availableUnits })),
    availableUnits: Math.max(0, batch.availableUnits - excludedForUnit
      .filter((position) => position.batchId === batch.batchId)
      .reduce((sum, position) => sum + position.quantity, 0)),
  })) ?? [];
  const selectedBatch = availableByBatch.find((batch) => batch.batchId === selectedBatchId);
  const availableUnits = mixedDates
    ? Math.max(0, (options?.availableUnits ?? 0) - excludedUnits)
    : selectedBatch?.availableUnits ?? 0;
  const availablePackages = factor ? Math.floor(availableUnits / factor) : 0;

  function chooseBatch(batchId: string) {
    if (batchId === selectedBatchId) return;
    setSelectedBatchId(batchId);
    setSources([]);
    setPackageQuantity('');
    setPage(1);
    setLoading(true);
    setError('');
  }

  function toggleMixed(checked: boolean) {
    setMixedDates(checked);
    setSelectedBatchId('');
    setSources([]);
    setPackageQuantity('');
    setPage(1);
    setLoading(true);
    setError('');
  }

  function changeSource(position: StockPosition, input: string) {
    const quantity = Number(input);
    setSources((current) => {
      const other = current.filter((source) => source.position.id !== position.id);
      return input && Number.isSafeInteger(quantity) && quantity > 0
        ? [...other, { position, quantity }] : other;
    });
  }

  function add(event: FormEvent) {
    event.preventDefault();
    if (!unit || unit.defaultUnit !== 'UN' || !packaged || (!mixedDates && !selectedBatchId)
      || !Number.isSafeInteger(amount) || amount < 1 || amount > availablePackages) {
      setError('Selecione unidade, embalagem e quantidade inteira dentro do saldo disponível.'); return;
    }
    if (!sources.length || sources.some((source) => source.quantity > source.position.quantity) || allocated !== needed) {
      setError(`Distribua exatamente ${needed} UN entre as posições de origem (informado: ${allocated} UN).`); return;
    }
    const batches = new Set(sources.map((source) => source.position.batchId));
    const dates = new Set(sources.map((source) => `${source.position.batch.manufacturingDate}:${source.position.batch.expirationDate}`));
    if (mixedDates ? dates.size < 2 : batches.size !== 1 || !batches.has(selectedBatchId)) {
      setError(mixedDates ? 'Lote 0 exige pelo menos duas datas diferentes.' : 'Sem datas misturadas, escolha apenas um lote.'); return;
    }
    onAdd(unit, { packageProduct: packaged, packageQuantity: amount, mixedDates, sources }, observation.trim());
  }

  return <form className="form-grid assembly-form" onSubmit={add}>
    {error && <div className="wide"><Notice kind="error" onClose={() => setError('')}>{error}</Notice></div>}
    <div className="wide"><ProductAutocomplete onChange={(selected) => { setUnit(selected); setOptions(null); setLoading(Boolean(selected && selected.defaultUnit === 'UN')); setPage(1); setPackageId(''); setSelectedBatchId(''); setMixedDates(false); setSources([]); }} /></div>
    {unit && unit.defaultUnit !== 'UN' && <p className="wide photo-required">Selecione o código unitário (UN) que será usado na montagem.</p>}
    {unit?.defaultUnit === 'UN' && <>
      <label className="wide">Embalagem vinculada *<select value={packageId} onChange={(event) => { setPackageId(event.target.value); setPackageQuantity(''); }} disabled={loading} required>
        <option value="">Selecione fardo ou caixa</option>
        {options?.packages.map((product) => <option key={product.id} value={product.id}>{product.code} — {product.name} ({product.defaultUnit}, {product.unitsPerPackage} UN)</option>)}
      </select></label>
      {!loading && options?.packages.length === 0 && <p className="wide muted">Nenhum fardo/caixa vinculado a esta unidade.</p>}
      {packaged && <>
        <label className="wide assembly-mixed-toggle"><input type="checkbox" checked={mixedDates} onChange={(event) => toggleMixed(event.target.checked)} /> Usar datas misturadas (Lote 0)</label>
        {!mixedDates && <div className="wide assembly-batches">
          <strong>Escolha a data/lote de origem *</strong>
          <p className="muted">Veja quantas embalagens cada posição forma sozinha. O total do lote combina seus locais.</p>
          {availableByBatch.length === 0 && !loading && <p className="muted">Nenhuma data com unidades disponíveis.</p>}
          {availableByBatch.map((batch) => { const capacity = Math.floor(batch.availableUnits / factor); return <button
            key={batch.batchId} type="button" className={`assembly-batch-option ${selectedBatchId === batch.batchId ? 'is-selected' : ''}`}
            aria-pressed={selectedBatchId === batch.batchId} disabled={loading || capacity === 0}
            onClick={() => chooseBatch(batch.batchId)}>
            <span><strong>Prod: {formatDate(batch.manufacturingDate)}</strong> · lote {batch.code} · val: {formatDate(batch.expirationDate)}</span>
            <span>Total do lote: {batch.availableUnits} UN · até <strong>{capacity} {packaged.defaultUnit}</strong></span>
            <span className="assembly-batch-positions">{batch.positions.map((position) => <span key={position.positionId}>
              {position.stockLocationName}: {position.availableUnits} UN · até <strong>{Math.floor(position.availableUnits / factor)} {packaged.defaultUnit}</strong> nesta posição
            </span>)}</span>
          </button>; })}
        </div>}
        {mixedDates && <p className="wide available-balance">Total disponível para Lote 0: {availableUnits} UN · até <strong>{availablePackages} {packaged.defaultUnit}</strong> de {factor} UN.</p>}
        {!mixedDates && selectedBatch && <p className="wide available-balance">Data/lote escolhido: {selectedBatch.availableUnits} UN · até <strong>{availablePackages} {packaged.defaultUnit}</strong> de {factor} UN.</p>}
        <label>Quantidade de {packaged.defaultUnit} para enviar *<input type="number" inputMode="numeric" min="1" max={availablePackages} step="1" value={packageQuantity} onChange={(event) => setPackageQuantity(event.target.value)} disabled={!mixedDates && !selectedBatchId} required /></label>
        <div className="wide"><strong>Parcelas de origem</strong><p className="muted">Informe quantas unidades retirar de cada posição. {mixedDates ? 'Selecione posições com datas diferentes; a embalagem ficará como “Lote 0 — datas misturadas”.' : 'As posições devem ser do mesmo lote.'}</p></div>
        {!mixedDates && !selectedBatchId && <p className="wide muted">Escolha uma data/lote acima para informar as parcelas.</p>}
        {!loading && (mixedDates || selectedBatchId) && options?.positions.items.map((position) => { const excluded = excludedIds.has(position.id); const selected = sources.find((source) => source.position.id === position.id); return <label className="assembly-source" key={position.id}>
          <span>{position.stockLocation.name} · lote {position.batch.code} · prod: {formatDate(position.batch.manufacturingDate)} · val: {formatDate(position.batch.expirationDate)} · saldo {position.quantity} UN · até {excluded ? 0 : Math.floor(position.quantity / factor)} {packaged.defaultUnit} nesta posição{excluded ? ' · já usado neste envio' : ''}</span>
          <input type="number" inputMode="numeric" min="0" max={position.quantity} step="1" value={selected?.quantity ?? ''} disabled={excluded} placeholder="UN desta posição" onChange={(event) => changeSource(position, event.target.value)} />
        </label>; })}
        {(mixedDates || selectedBatchId) && options && options.positions.meta.totalPages > 1 && <div className="wide row-actions"><button type="button" className="secondary" disabled={page <= 1 || loading} onClick={() => { setLoading(true); setPage((current) => current - 1); }}>Anteriores</button><span>{page}/{options.positions.meta.totalPages}</span><button type="button" className="secondary" disabled={page >= options.positions.meta.totalPages || loading} onClick={() => { setLoading(true); setPage((current) => current + 1); }}>Próximas</button></div>}
        <p className="wide available-balance">Parcela informada: <strong>{allocated} de {Number.isSafeInteger(needed) ? needed : 0} UN</strong></p>
      </>}
    </>}
    <label className="wide">Observação deste produto (opcional)<textarea maxLength={1000} rows={2} value={observation} onChange={(event) => setObservation(event.target.value)} /></label>
    <div className="form-actions"><button disabled={!packaged || loading}>Adicionar embalagem</button></div>
  </form>;
}
