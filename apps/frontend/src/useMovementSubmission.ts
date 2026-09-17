import { useRef, useState } from 'react';
import { api, ApiError } from './api';

export function useMovementSubmission(path: string, onCreated: (id: string) => void, withRequestKey = true) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState<ApiError | null>(null);
  const inFlight = useRef(false);
  const requestKey = useRef(crypto.randomUUID());
  const accepted = useRef<string[]>([]);

  function resetConfirmation() { setConflict(null); accepted.current = []; setError(''); }

  async function submit(payload: Record<string, unknown>, files?: File[]) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    // This runs only on an explicit second click after showing the conflict.
    if (conflict) accepted.current = [...new Set([...accepted.current, ...(conflict.details?.expirationKeys ?? [])])];
    try {
      const body = {
        ...payload, ...(withRequestKey ? { requestKey: requestKey.current } : {}), confirmedExpirationKeys: accepted.current,
      };
      const movement = files ? await api.postMultipart<{ id: string }>(path, body, files) : await api.post<{ id: string }>(path, body);
      requestKey.current = crypto.randomUUID();
      onCreated(movement.id);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'LOT_EXPIRATION_CONFIRMATION_REQUIRED') {
        setConflict(caught);
      } else {
        setConflict(null);
        setError(caught instanceof Error ? caught.message : 'Não foi possível confirmar a operação.');
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return { busy, error, conflict, submit, resetConfirmation };
}
