import { FormEvent, useState } from 'react';
import { api, Movement } from './api';
import { movementCancellationImpact } from './movement-cancellation-impact';

export function MovementCancellationDialog({
  movement,
  onClose,
  onCanceled,
}: {
  movement: Movement;
  onClose: () => void;
  onCanceled: (movement: Movement) => void;
}) {
  const [reason, setReason] = useState('');
  const [showImpact, setShowImpact] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function review(event: FormEvent) {
    event.preventDefault();
    if (!reason.trim()) {
      setError('Informe o motivo do cancelamento.');
      return;
    }
    setError('');
    setShowImpact(true);
  }

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const canceled = await api.post<Movement>(`/movements/${movement.id}/cancellation`, {
        reason: reason.trim(),
      });
      onCanceled(canceled);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Nao foi possivel cancelar a movimentacao.');
      setShowImpact(false);
    } finally {
      setBusy(false);
    }
  }

  return <div className="dialog-backdrop" role="presentation">
    <section className="dialog confirmation-dialog" role="dialog" aria-modal="true" aria-labelledby="cancel-title">
      <p className="eyebrow">Cancelamento integral</p>
      <h2 id="cancel-title">{showImpact ? 'Confirme o impacto no estoque' : 'Cancelar movimentacao'}</h2>
      {error && <p className="dialog-error" role="alert">{error}</p>}
      {!showImpact ? <form onSubmit={review}>
        <label>Motivo <span className="required">*</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} rows={4} autoFocus required /></label>
        <p>A movimentacao original permanecera no historico como cancelada.</p>
        <div className="dialog-actions"><button type="button" className="secondary" onClick={onClose}>Voltar</button><button>Visualizar impacto</button></div>
      </form> : <>
        <ul className="cancellation-impact">{movementCancellationImpact(movement).map((impact, index) => <li key={index}>{impact}</li>)}</ul>
        <p><strong>Motivo:</strong> {reason.trim()}</p>
        <p>O cancelamento sera bloqueado se algum saldo necessario ja tiver sido consumido.</p>
        <div className="dialog-actions"><button type="button" className="secondary" disabled={busy} onClick={() => setShowImpact(false)}>Alterar motivo</button><button type="button" className="danger" disabled={busy} onClick={() => void confirm()}>{busy ? 'Cancelando...' : 'Confirmar cancelamento'}</button></div>
      </>}
    </section>
  </div>;
}
