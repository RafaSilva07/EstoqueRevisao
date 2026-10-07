import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, Paginated, Product, StockPosition } from './api';
import { LoadingState, Notice } from './components';
import { formatDate } from './format';
import { ProductAutocomplete } from './ProductAutocomplete';
import { DraftActions } from './FormDrafts';
import { useFormDraft } from './useFormDraft';

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
  const [selectedPositions, setSelectedPositions] = useState<StockPosition[]>([]);
  const [sourceInputs, setSourceInputs] = useState<Record<string, string>>({});
  const [showOtherPositions, setShowOtherPositions] = useState(false);
  const [observation, setObservation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [productQuery, setProductQuery] = useState({ code: '', name: '' });
  const [savingItem, setSavingItem] = useState(false);
  const addingItem = useRef(false);
  const draft = useFormDraft('shipment:REVISAO:assembly', 'Montagem de fardo/caixa', { unit, page, showOtherPositions, packageId, packageQuantity, mixedDates, selectedBatchId, selectedPositions, sourceInputs, observation, productQuery }, (saved) => {
    setProductQuery(saved.productQuery); setUnit(saved.unit); setPage(saved.page); setShowOtherPositions(saved.showOtherPositions); setPackageId(saved.packageId); setPackageQuantity(saved.packageQuantity); setMixedDates(saved.mixedDates); setSelectedBatchId(saved.selectedBatchId); setSelectedPositions(saved.selectedPositions); setSourceInputs(saved.sourceInputs); setObservation(saved.observation);
  }, { busy: savingItem });

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
  const sources = selectedPositions.flatMap((position) => {
    const quantity = selectedPositions.length === 1 ? needed : Number(sourceInputs[position.id]);
    return Number.isSafeInteger(quantity) && quantity > 0 ? [{ position, quantity }] : [];
  });
  const allocated = sources.reduce((sum, source) => sum + source.quantity, 0);
  const excludedForUnit = [...new Map(excludedPositions.filter((position) => position.productId === unit?.id)
    .map((position) => [position.id, position])).values()];
  const excludedIds = new Set(excludedForUnit.map((position) => position.id));
  const excludedUnits = excludedForUnit
    .reduce((sum, position) => sum + position.quantity, 0);
  const availableByBatch = options?.availableByBatch.map((batch) => ({
    ...batch,
    availableUnits: Math.max(0, batch.availableUnits - excludedForUnit
      .filter((position) => position.batchId === batch.batchId)
      .reduce((sum, position) => sum + position.quantity, 0)),
  })) ?? [];
  const selectedBatch = availableByBatch.find((batch) => batch.batchId === selectedBatchId);
  const availableUnits = mixedDates
    ? Math.max(0, (options?.availableUnits ?? 0) - excludedUnits)
    : selectedBatch?.availableUnits ?? 0;
  const availablePackages = factor ? Math.floor(availableUnits / factor) : 0;
  const currentPositions = options?.positions.items ?? [];
  const primaryPositions = [
    ...selectedPositions.filter((position) => !currentPositions.some((item) => item.id === position.id)),
    ...currentPositions.filter((position) => position.stockLocation.code === 'LATA_BOA' || selectedPositions.some((item) => item.id === position.id)),
  ];
  const otherPositions = currentPositions.filter((position) => position.stockLocation.code !== 'LATA_BOA'
    && !selectedPositions.some((item) => item.id === position.id));

  function changeBatch() {
    setSelectedBatchId('');
    setSelectedPositions([]);
    setSourceInputs({});
    setShowOtherPositions(false);
    setPackageQuantity('');
    setPage(1);
    setLoading(true);
    setError('');
  }

  function toggleMixed(checked: boolean) {
    setMixedDates(checked);
    setSelectedBatchId('');
    setSelectedPositions([]);
    setSourceInputs({});
    setShowOtherPositions(false);
    setPackageQuantity('');
    setPage(1);
    setLoading(true);
    setError('');
  }

  function togglePosition(position: StockPosition) {
    if (excludedIds.has(position.id)) return;
    if (!mixedDates && !selectedBatchId) {
      setSelectedBatchId(position.batchId);
      setSelectedPositions([position]);
      setPage(1);
      setLoading(true);
      return;
    }
    setSelectedPositions((current) => current.some((item) => item.id === position.id)
      ? current.filter((item) => item.id !== position.id) : [...current, position]);
    setSourceInputs((current) => { const next = { ...current }; delete next[position.id]; return next; });
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    if (addingItem.current) return;
    if (!unit || unit.defaultUnit !== 'UN' || !packaged || (!mixedDates && !selectedBatchId)
      || !Number.isSafeInteger(amount) || amount < 1 || amount > availablePackages) {
      setError('Selecione unidade, embalagem e quantidade inteira dentro do saldo disponível.'); return;
    }
    if (sources.length !== selectedPositions.length || sources.some((source) => excludedIds.has(source.position.id) || source.quantity > source.position.quantity) || allocated !== needed) {
      setError(`Distribua exatamente ${needed} UN entre as posições de origem (informado: ${allocated} UN).`); return;
    }
    const batches = new Set(sources.map((source) => source.position.batchId));
    const dates = new Set(sources.map((source) => `${source.position.batch.manufacturingDate}:${source.position.batch.expirationDate}`));
    if (mixedDates ? dates.size < 2 : batches.size !== 1 || !batches.has(selectedBatchId)) {
      setError(mixedDates ? 'Lote 0 exige pelo menos duas datas diferentes.' : 'Sem datas misturadas, escolha apenas um lote.'); return;
    }
    addingItem.current = true; setSavingItem(true);
    try { await draft.complete(); onAdd(unit, { packageProduct: packaged, packageQuantity: amount, mixedDates, sources }, observation.trim()); }
    finally { addingItem.current = false; setSavingItem(false); }
  }

  function renderPosition(position: StockPosition) {
    const excluded = excludedIds.has(position.id);
    const checked = selectedPositions.some((item) => item.id === position.id);
    return <div className={`assembly-source ${checked ? 'is-selected' : ''}`} key={position.id}>
      <label className="assembly-source-choice"><input type="checkbox" checked={checked} disabled={excluded} onChange={() => togglePosition(position)} />
        <span><strong>{position.stockLocation.name}</strong> · lote {position.batch.code} · prod: {formatDate(position.batch.manufacturingDate)} · val: {formatDate(position.batch.expirationDate)} · saldo {position.quantity} UN · até {excluded ? 0 : Math.floor(position.quantity / factor)} {packaged?.defaultUnit} nesta posição{excluded ? ' · já usado neste envio' : ''}</span>
      </label>
      {checked && selectedPositions.length > 1 && <label className="assembly-source-quantity">UN desta posição<input type="number" inputMode="numeric" min="1" max={position.quantity} step="1" value={sourceInputs[position.id] ?? ''} onChange={(event) => setSourceInputs((current) => ({ ...current, [position.id]: event.target.value }))} /></label>}
      {checked && selectedPositions.length === 1 && <span className="assembly-source-auto">{Number.isSafeInteger(needed) && needed > 0 ? `${needed} UN desta posição` : 'Informe a quantidade de embalagens'}</span>}
    </div>;
  }

  if (!draft.ready) return <LoadingState label="Recuperando montagem em rascunho" />;
  return <form className="form-grid assembly-form" onSubmit={(event) => void add(event)}>
    <div className="wide"><DraftActions draft={draft} /></div>
    {error && <div className="wide"><Notice kind="error" onClose={() => setError('')}>{error}</Notice></div>}
    <div className="wide"><ProductAutocomplete draftQuery={productQuery} onQueryChange={setProductQuery} initialProduct={unit} onChange={(selected) => { setUnit(selected); setOptions(null); setLoading(Boolean(selected && selected.defaultUnit === 'UN')); setPage(1); setPackageId(''); setSelectedBatchId(''); setMixedDates(false); setSelectedPositions([]); setSourceInputs({}); setShowOtherPositions(false); }} /></div>
    {unit && unit.defaultUnit !== 'UN' && <p className="wide photo-required">Selecione o código unitário (UN) que será usado na montagem.</p>}
    {unit?.defaultUnit === 'UN' && <>
      <label className="wide">Embalagem vinculada *<select value={packageId} onChange={(event) => { setPackageId(event.target.value); setPackageQuantity(''); }} disabled={loading} required>
        <option value="">Selecione fardo ou caixa</option>
        {options?.packages.map((product) => <option key={product.id} value={product.id}>{product.code} — {product.name} ({product.defaultUnit}, {product.unitsPerPackage} UN)</option>)}
      </select></label>
      {!loading && options?.packages.length === 0 && <p className="wide muted">Nenhum fardo/caixa vinculado a esta unidade.</p>}
      {packaged && <>
        <label className="wide assembly-mixed-toggle"><input type="checkbox" checked={mixedDates} onChange={(event) => toggleMixed(event.target.checked)} /> Usar datas misturadas (Lote 0)</label>
        {mixedDates && <p className="wide available-balance">Total disponível para Lote 0: {availableUnits} UN · até <strong>{availablePackages} {packaged.defaultUnit}</strong> de {factor} UN.</p>}
        <label>Quantidade de {packaged.defaultUnit} para enviar *<input type="number" inputMode="numeric" min="1" max={availablePackages} step="1" value={packageQuantity} onChange={(event) => setPackageQuantity(event.target.value)} disabled={!mixedDates && !selectedBatchId} required /></label>
        <div className="wide assembly-source-heading">
          <strong>Posições de origem</strong>
          <p className="muted">Marque uma posição para usar nela as unidades necessárias. Ao marcar mais de uma, informe a parcela de cada uma. {mixedDates ? 'Lote 0 exige datas diferentes.' : 'As posições devem ser do mesmo lote.'}</p>
          {!mixedDates && selectedBatch && <button type="button" className="secondary" onClick={changeBatch}>Trocar lote {selectedBatch.code}</button>}
        </div>
        {!loading && availableByBatch.length === 0 && <p className="wide muted">Nenhuma posição com unidades disponíveis.</p>}
        {!loading && options && <>
          {primaryPositions.map(renderPosition)}
          {otherPositions.length > 0 && <button type="button" className="wide secondary assembly-more" aria-expanded={showOtherPositions} onClick={() => setShowOtherPositions((current) => !current)}>{showOtherPositions ? 'Ocultar outras posições' : `Ver outras posições (${otherPositions.length})`}</button>}
          {showOtherPositions && otherPositions.map(renderPosition)}
        </>}
        {options && options.positions.meta.totalPages > 1 && <div className="wide row-actions"><button type="button" className="secondary" disabled={page <= 1 || loading} onClick={() => { setLoading(true); setPage((current) => current - 1); }}>Anteriores</button><span>{page}/{options.positions.meta.totalPages}</span><button type="button" className="secondary" disabled={page >= options.positions.meta.totalPages || loading} onClick={() => { setLoading(true); setPage((current) => current + 1); }}>Próximas</button></div>}
        <p className="wide available-balance">Parcela informada: <strong>{allocated} de {Number.isSafeInteger(needed) ? needed : 0} UN</strong></p>
      </>}
    </>}
    <label className="wide">Observação deste produto (opcional)<textarea maxLength={1000} rows={2} value={observation} onChange={(event) => setObservation(event.target.value)} /></label>
    <div className="form-actions"><button disabled={!packaged || loading || savingItem}>Adicionar embalagem</button></div>
  </form>;
}
