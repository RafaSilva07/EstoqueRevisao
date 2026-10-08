import { useRef, useState } from 'react';
import { api, ApiError } from './api';

export function useMovementSubmission(path: string, onCreated: (id: string) => void | Promise<void>, withRequestKey = true) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState<ApiError | null>(null);
  const inFlight = useRef(false);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const accepted = useRef<string[]>([]);
  const acceptedDuplicates = useRef<string[]>([]);
  const previousPayload = useRef('');

  function resetConfirmation() { setConflict(null); accepted.current = []; acceptedDuplicates.current = []; previousPayload.current = ''; setError(''); }

  async function submit(payload: Record<string, unknown>, files?: File[]) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    const serialized = JSON.stringify(payload);
    // Confirmations belong to the unchanged operation, never to an edited form/draft.
    if (serialized !== previousPayload.current) {
      accepted.current = []; acceptedDuplicates.current = []; setConflict(null);
    } else if (conflict) {
      // Only an explicit second click accepts the warning that was just shown.
      accepted.current = [...new Set([...accepted.current, ...(conflict.details?.expirationKeys ?? [])])];
      acceptedDuplicates.current = [...new Set([...acceptedDuplicates.current, ...(conflict.details?.duplicateKeys ?? [])])];
    }
    previousPayload.current = serialized;
    try {
      const body = {
        ...payload, ...(withRequestKey ? { requestKey } : {}), confirmedExpirationKeys: accepted.current,
        ...(withRequestKey && acceptedDuplicates.current.length ? { confirmedDuplicateKeys: acceptedDuplicates.current } : {}),
      };
      const movement = files ? await api.postMultipart<{ id: string }>(path, body, files) : await api.post<{ id: string }>(path, body);
      setRequestKey(crypto.randomUUID());
      await onCreated(movement.id);
      return 'created' as const;
    } catch (caught) {
      if (caught instanceof ApiError && ['LOT_EXPIRATION_CONFIRMATION_REQUIRED', 'RECENT_DUPLICATE_CONFIRMATION_REQUIRED'].includes(caught.code ?? '')) {
        setConflict(caught);
        return 'confirmation' as const;
      } else {
        setConflict(null);
        setError(caught instanceof Error ? caught.message : 'Não foi possível confirmar a operação.');
        return 'error' as const;
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  function confirmationTitle(fallback: string) {
    return conflict?.code === 'RECENT_DUPLICATE_CONFIRMATION_REQUIRED' ? 'Possível movimentação duplicada' : conflict ? 'Mesmo lote com outra validade' : fallback;
  }
  function confirmationLabel(fallback: string, expirationLabel = 'Confirmar com validades separadas') {
    return conflict?.code === 'RECENT_DUPLICATE_CONFIRMATION_REQUIRED' ? 'Conferi: continuar mesmo assim' : conflict ? expirationLabel : fallback;
  }
  return { busy, error, conflict, submit, resetConfirmation, requestKey, setRequestKey, confirmationTitle, confirmationLabel };
}
