import { FormEvent, useState } from 'react';
import { api, Batch, Product } from './api';
import { Notice } from './components';

const messageFrom = (error: unknown) => error instanceof Error
  ? error.message
  : 'Ocorreu um erro inesperado.';

export function QuickBatchDialog({
  product,
  onCreated,
  onCancel,
}: {
  product: Product;
  onCreated: (batch: Batch) => void;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const batch = await api.post<Batch>('/batches', {
        productId: product.id,
        manufacturingDate: form.get('manufacturingDate'),
        expirationDate: form.get('expirationDate'),
      });
      onCreated(batch);
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setBusy(false);
    }
  }

  return <div className="dialog-backdrop"><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="quick-batch-title">
    <p className="eyebrow">Novo lote</p>
    <h2 id="quick-batch-title">{product.name}</h2>
    <p>A fabricacao gera o codigo pela regra CONSERVADI. Informe a validade manualmente.</p>
    {error && <Notice kind="error">{error}</Notice>}
    <form className="form-grid" onSubmit={(event) => void submit(event)}>
      <label><span>Fabricacao <span className="required">*</span></span><input name="manufacturingDate" type="date" required autoFocus /></label>
      <label><span>Validade <span className="required">*</span></span><input name="expirationDate" type="date" required /></label>
      <div className="form-actions"><button type="button" className="secondary" disabled={busy} onClick={onCancel}>Cancelar</button><button disabled={busy}>{busy ? 'Criando...' : 'Criar e selecionar'}</button></div>
    </form>
  </section></div>;
}
