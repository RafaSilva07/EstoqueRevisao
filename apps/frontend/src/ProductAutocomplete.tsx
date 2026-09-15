import { KeyboardEvent, useCallback, useEffect, useId, useRef, useState } from 'react';
import { api, Paginated, Product } from './api';

type SearchField = 'code' | 'name';

export function ProductAutocomplete({
  onChange,
}: {
  onChange: (product: Product | null) => void;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [field, setField] = useState<SearchField | null>(null);
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  const [highlighted, setHighlighted] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requestVersion = useRef(0);
  const listId = useId();
  const query = field === 'code' ? code : name;

  const select = useCallback((product: Product) => {
    setCode(product.code);
    setName(product.name);
    setField(null);
    setSuggestions([]);
    setError('');
    onChange(product);
  }, [onChange]);

  useEffect(() => {
    if (!field) return;
    const version = ++requestVersion.current;
    const timer = window.setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({ limit: '20', active: 'true', searchField: field });
      if (query.trim()) params.set('search', query.trim());
      void api.get<Paginated<Product>>(`/products?${params}`)
        .then((result) => {
          if (version !== requestVersion.current) return;
          setSuggestions(result.items);
          setHighlighted(0);
          setError('');
          if (field === 'code') {
            const exact = result.items.find((product) => product.code.toLocaleLowerCase('pt-BR') === query.trim().toLocaleLowerCase('pt-BR'));
            if (exact) select(exact);
          } else {
            const exact = result.items.filter((product) => product.name.toLocaleLowerCase('pt-BR') === query.trim().toLocaleLowerCase('pt-BR'));
            if (exact.length === 1) select(exact[0]);
          }
        })
        .catch((caught: unknown) => {
          if (version === requestVersion.current) {
            setSuggestions([]);
            setError(caught instanceof Error ? caught.message : 'Não foi possível pesquisar produtos.');
          }
        })
        .finally(() => { if (version === requestVersion.current) setLoading(false); });
    }, 220);
    return () => { window.clearTimeout(timer); requestVersion.current += 1; };
  }, [field, query, select]);

  function edit(nextField: SearchField, value: string) {
    if (nextField === 'code') {
      setCode(value.toLocaleUpperCase('pt-BR'));
      setName('');
    } else {
      setName(value);
      setCode('');
    }
    onChange(null);
    setField(nextField);
  }

  function browse(nextField: SearchField) {
    setCode('');
    setName('');
    onChange(null);
    setField(nextField);
  }

  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!field || suggestions.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted((current) => (current + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((current) => (current - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      select(suggestions[highlighted]);
    } else if (event.key === 'Escape') {
      setField(null);
    }
  }

  const list = field && <div id={listId} className="autocomplete-list" role="listbox" aria-label={field === 'code' ? 'Sugestões de código' : 'Sugestões de descrição'}>
    {loading && <span className="autocomplete-message" role="status">Pesquisando…</span>}
    {!loading && error && <span className="autocomplete-message field-error" role="alert">{error}</span>}
    {!loading && !error && suggestions.length === 0 && <span className="autocomplete-message">Nenhum produto encontrado.</span>}
    {!loading && suggestions.map((product, index) => <button type="button" role="option" aria-selected={index === highlighted}
      className={index === highlighted ? 'autocomplete-option highlighted' : 'autocomplete-option'} key={product.id}
      onMouseDown={(event) => event.preventDefault()} onClick={() => select(product)}>
      <strong>{product.code}</strong><span>{product.name}</span>
    </button>)}
    {!loading && suggestions.length === 20 && <small className="autocomplete-message">Continue digitando para refinar a lista.</small>}
  </div>;

  return <fieldset className="product-autocomplete wide" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setField(null);
  }}>
    <legend>Produto</legend>
    <p className="muted">Digite no código ou na descrição e escolha uma sugestão. Ao selecionar, o outro campo será preenchido automaticamente.</p>
    <div className="form-grid">
      <label>Código *<span className="autocomplete-control">
        <input value={code} autoComplete="off" aria-autocomplete="list" aria-controls={listId} aria-expanded={field === 'code'} role="combobox"
          onFocus={() => setField('code')} onChange={(event) => edit('code', event.target.value)} onKeyDown={keyDown} placeholder="Digite ou abra a lista" />
        <button type="button" className="autocomplete-toggle" aria-label="Abrir lista de códigos" onClick={() => browse('code')}>⌄</button>
        {field === 'code' && list}
      </span></label>
      <label>Descrição *<span className="autocomplete-control">
        <input value={name} autoComplete="off" aria-autocomplete="list" aria-controls={listId} aria-expanded={field === 'name'} role="combobox"
          onFocus={() => setField('name')} onChange={(event) => edit('name', event.target.value)} onKeyDown={keyDown} placeholder="Digite o nome do produto" />
        <button type="button" className="autocomplete-toggle" aria-label="Abrir lista de descrições" onClick={() => browse('name')}>⌄</button>
        {field === 'name' && list}
      </span></label>
    </div>
  </fieldset>;
}
