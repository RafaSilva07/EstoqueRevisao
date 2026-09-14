import { useEffect, useRef, useState } from 'react';
import { api, Product } from './api';
import { OperationalLot } from './operational-lot';

export function OperationalLotFields({ product, value, onChange, onReady, resolvePath = '/movements/resolve-lot' }: {
  resolvePath?: string;
  product: Product;
  value: OperationalLot;
  onChange: (lot: OperationalLot) => void;
  onReady: (ready: boolean) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [suggested, setSuggested] = useState('');
  const version = useRef(0);
  const current = useRef(value);
  const dirty = useRef<'code' | 'manufacturingDate' | null>(null);
  useEffect(() => { current.current = value; }, [value]);
  useEffect(() => () => { version.current += 1; }, []);

  async function resolve(field: 'code' | 'manufacturingDate', input: string) {
    if (dirty.current !== field) return;
    const requestVersion = ++version.current;
    onReady(false);
    setError('');
    setPending(true);
    const next = { ...current.current, [field]: field === 'code' ? input.toUpperCase() : input };
    onChange(next);
    if (!input) { setPending(false); return; }
    try {
      const result = await api.post<{ code: string; manufacturingDate: string; suggestedExpirationDate: string | null }>(
        resolvePath, { productId: product.id, [field]: input },
      );
      if (requestVersion !== version.current) return;
      const expiry = result.suggestedExpirationDate ?? current.current.expirationDate;
      setSuggested(result.suggestedExpirationDate ?? '');
      onChange({ code: result.code, manufacturingDate: result.manufacturingDate, expirationDate: expiry });
      dirty.current = null;
      onReady(true);
    } catch (caught) {
      if (requestVersion === version.current) setError(caught instanceof Error ? caught.message : 'Não foi possível validar o lote.');
    } finally {
      if (requestVersion === version.current) setPending(false);
    }
  }

  function change(field: 'code' | 'manufacturingDate', input: string) {
    version.current += 1;
    dirty.current = field;
    setPending(false);
    onReady(false);
    onChange({ ...value, [field]: field === 'code' ? input.toUpperCase() : input });
  }

  return <fieldset className="operational-lot wide">
    <legend>Lote e datas</legend>
    <p className="muted">Preencha o lote ou a fabricação. Ao sair do campo, completamos o outro.</p>
    <div className="form-grid">
      <label>Lote CONSERVADI
        <input value={value.code} maxLength={6} autoCapitalize="characters" spellCheck={false}
          onChange={(event) => change('code', event.target.value)}
          onBlur={(event) => { if (event.target.value !== '' && !pending) void resolve('code', event.target.value); }}
          aria-invalid={Boolean(error)} />
      </label>
      <label>Fabricação
        <input type="date" min="2000-01-01" max="2099-12-31" value={value.manufacturingDate}
          onChange={(event) => change('manufacturingDate', event.target.value)}
          onBlur={(event) => { if (event.target.value !== '' && !pending) void resolve('manufacturingDate', event.target.value); }}
          aria-invalid={Boolean(error)} />
      </label>
      <label>Validade <span className="required">*</span>
        <input type="date" value={value.expirationDate} min={value.manufacturingDate || undefined} required disabled={pending}
          onChange={(event) => onChange({ ...value, expirationDate: event.target.value })} />
        <small>{suggested && value.expirationDate === suggested ? 'Sugerida pelo prazo do produto. Você pode editar.' : 'Validade informada pelo operador.'}</small>
        {!product.shelfLifeYears && <small>Produto ainda sem prazo padrão. Informe a validade manualmente.</small>}
      </label>
    </div>
    {pending && <p role="status">Completando lote e fabricação…</p>}
    {error && <p className="field-error" role="alert">{error}</p>}
  </fieldset>;
}
