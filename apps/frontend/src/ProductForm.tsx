import { FormEvent, useEffect, useState } from 'react';
import { api, Paginated, Product } from './api';
import { ProductAutocomplete } from './ProductAutocomplete';

export function ProductForm({ product, busy, onSave, onCancel }: {
  product: Product | null; busy: boolean; onSave: (payload: Record<string, unknown>) => Promise<void>; onCancel: () => void;
}) {
  const [unit, setUnit] = useState(product?.defaultUnit ?? 'UN');
  const [options, setOptions] = useState<Product[]>(product?.unitProducts ?? []);
  const [selected, setSelected] = useState<Product | null>(null);
  const [searchKey, setSearchKey] = useState(0);
  const [code, setCode] = useState(product?.code ?? '');
  const [codeCheck, setCodeCheck] = useState<{ code: string; duplicate: Product | null; error: boolean } | null>(null);
  const normalizedCode = code.trim().toLowerCase();
  const duplicate = codeCheck?.code === normalizedCode ? codeCheck.duplicate : null;
  useEffect(() => {
    if (!normalizedCode || normalizedCode === product?.code.toLowerCase()) return;
    let active = true;
    const timeout = window.setTimeout(() => {
      void api.get<Paginated<Product>>(`/products?code=${encodeURIComponent(normalizedCode)}&limit=1`)
        .then((result) => { if (active) setCodeCheck({ code: normalizedCode, duplicate: result.items.find((item) => item.id !== product?.id) ?? null, error: false }); })
        .catch(() => { if (active) setCodeCheck({ code: normalizedCode, duplicate: null, error: true }); });
    }, 300);
    return () => { active = false; window.clearTimeout(timeout); };
  }, [normalizedCode, product?.code, product?.id]);
  const packaging = unit === 'FD' || unit === 'CX';

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || duplicate || (packaging && !options.length)) return;
    const form = new FormData(event.currentTarget);
    void onSave({ code: form.get('code'), name: form.get('name'), shelfLifeYears: Number(form.get('shelfLifeYears')),
      ...(product?.defaultUnit === unit ? {} : { defaultUnit: unit }),
      unitWeightGrams: unit === 'UN' ? Number(form.get('unitWeightGrams')) : null,
      unitsPerPackage: packaging ? Number(form.get('unitsPerPackage')) : null,
      unitProductIds: packaging ? options.map((option) => option.id) : [],
    });
  }

  return <form className="form-grid" onSubmit={submit}>
    <label>Código *<input name="code" value={code} onChange={(event) => setCode(event.target.value)} aria-invalid={Boolean(duplicate)} aria-describedby="product-code-feedback" required maxLength={60} disabled={busy} autoFocus /><small id="product-code-feedback" className={duplicate ? 'field-error' : undefined} role="status">{duplicate ? `Código já cadastrado: ${duplicate.name}${duplicate.active ? '' : ' (inativo)'}.` : codeCheck?.code === normalizedCode && codeCheck.error ? 'Não foi possível consultar o código. Ele será validado ao salvar.' : ''}</small></label>
    <label>Descrição *<input name="name" defaultValue={product?.name} required maxLength={200} disabled={busy} /></label>
    <label>Tipo de unidade *<select value={unit} onChange={(event) => setUnit(event.target.value)} disabled={busy}>
      <option value="UN">Unidade (UN)</option><option value="FD">Fardo (FD)</option><option value="CX">Caixa (CX)</option>
      {!['UN', 'FD', 'CX'].includes(unit) && <option value={unit}>{unit} (cadastro anterior)</option>}
    </select></label>
    <label>Prazo padrão de validade (anos) *<input name="shelfLifeYears" type="number" min="1" step="1" defaultValue={product?.shelfLifeYears ?? ''} required disabled={busy} /><small>Sugere a validade de novas operações. Não altera o histórico.</small></label>
    {unit === 'UN' && <label>Gramatura da unidade (g) *<input name="unitWeightGrams" type="number" inputMode="numeric" min="1" max="2147483647" step="1" defaultValue={product?.unitWeightGrams ?? ''} required disabled={busy} /><small>Peso, em gramas, de uma unidade deste código.</small></label>}
    {packaging && <fieldset className="operational-lot wide" disabled={busy}>
      <legend>Conteúdo do fardo/caixa</legend>
      <label>Unidades por embalagem *<input name="unitsPerPackage" type="number" min="1" max="2147483647" step="1" defaultValue={product?.unitsPerPackage ?? ''} required /></label>
      <p>Vincule os produtos unitários possíveis. Na revisão será escolhido um único código por item.</p>
      <ProductAutocomplete key={searchKey} defaultUnit="UN" onChange={setSelected} />
      <button className="secondary" type="button" disabled={!selected || options.some((option) => option.id === selected.id)} onClick={() => {
        if (!selected) return;
        setOptions([...options, selected]); setSelected(null); setSearchKey((value) => value + 1);
      }}>Vincular código unitário</button>
      {!options.length && <p>Cadastre primeiro um produto Unidade (UN) e vincule ao menos uma opção.</p>}
      <ul className="packaging-options">{options.map((option) => <li key={option.id}><span>{option.code} — {option.name}{!option.active && ' (inativo)'}</span><button type="button" className="secondary" onClick={() => setOptions(options.filter((item) => item.id !== option.id))}>Remover vínculo</button></li>)}</ul>
    </fieldset>}
    <div className="form-actions wide"><button type="button" className="secondary" disabled={busy} onClick={onCancel}>Voltar</button><button disabled={busy || Boolean(duplicate) || (packaging && !options.length)}>{busy ? 'Salvando...' : 'Salvar produto'}</button></div>
  </form>;
}
