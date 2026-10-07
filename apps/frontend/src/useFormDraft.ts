import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useDraftWorkspace } from './draft-context';
import { draftFingerprint, formDraftStore, restoreDraftFiles } from './form-draft-store';

export function useFormDraft<T>(key: string, title: string, value: T, restore: (value: T) => void, options: { enabled?: boolean; busy?: boolean; reusable?: boolean } = {}) {
  const workspace = useDraftWorkspace();
  const storageKey = workspace?.scope ? `${workspace.scope}:${key}` : null;
  const enabled = options.enabled !== false;
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [savedFingerprint, setSavedFingerprint] = useState('');
  const [error, setError] = useState('');
  const latest = useRef({ value, restore, busy: options.busy ?? false });
  const baseline = useRef('');
  const initial = useRef(value);
  const persisted = useRef(false);
  const persistedFingerprint = useRef('');
  const suppressed = useRef(false);
  const resetAfterDiscard = useRef(false);
  const mounted = useRef(true);
  const serial = useRef<Promise<void>>(Promise.resolve());
  const urls = useRef<string[]>([]);
  const fingerprint = draftFingerprint(value);
  const ready = !workspace || (enabled && storageKey !== null && readyKey === storageKey);
  useLayoutEffect(() => { latest.current = { value, restore, busy: options.busy ?? false }; }, [value, restore, options.busy]);
  useEffect(() => { mounted.current = true; const previews = urls.current; return () => { mounted.current = false; previews.forEach((url) => URL.revokeObjectURL(url)); }; }, []);
  useEffect(() => {
    if (!storageKey || !enabled) { void Promise.resolve().then(() => setReadyKey(null)); return; }
    let active = true;
    suppressed.current = false;
    persisted.current = false;
    baseline.current = draftFingerprint(latest.current.value);
    initial.current = latest.current.value;
    void formDraftStore.read(storageKey).then((record) => {
      if (!active) return;
      setStatus(''); setError('');
      if (record?.version === 1) {
        persisted.current = true; persistedFingerprint.current = draftFingerprint(record.value);
        latest.current.restore(restoreDraftFiles(record.value as T, urls.current));
        setSavedFingerprint(draftFingerprint(record.value));
        setStatus('Rascunho recuperado. Confira os dados antes de confirmar.');
      }
    }).catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : 'Não foi possível recuperar o rascunho.'); })
      .finally(() => { if (active) setReadyKey(storageKey); });
    return () => { active = false; };
  }, [storageKey, enabled]);
  const dirty = useCallback(() => {
    const current = draftFingerprint(latest.current.value);
    return !suppressed.current && (current !== baseline.current || (persisted.current && current !== persistedFingerprint.current));
  }, []);
  const save = useCallback(async () => {
    if (!storageKey || !enabled || suppressed.current) return;
    const record = { key: storageKey, title, updatedAt: new Date().toISOString(), version: 1 as const, value: latest.current.value };
    const pending = serial.current.catch(() => undefined).then(() => formDraftStore.write(record));
    serial.current = pending;
    try {
      await pending; persisted.current = true; persistedFingerprint.current = draftFingerprint(record.value);
      if (mounted.current) { setError(''); setSavedFingerprint(persistedFingerprint.current); setStatus('Rascunho salvo neste navegador.'); }
    }
    catch (caught) { if (mounted.current) setError(caught instanceof Error ? caught.message : 'Não foi possível salvar o rascunho.'); throw caught; }
  }, [storageKey, enabled, title]);
  const discard = useCallback(async () => {
    if (!storageKey) return;
    suppressed.current = true;
    await serial.current.catch(() => undefined);
    try { await formDraftStore.removeTree(storageKey); }
    catch (caught) { suppressed.current = false; throw caught; }
    resetAfterDiscard.current = true;
    persisted.current = false;
    latest.current.restore(initial.current);
    if (mounted.current) { setStatus(''); setError(''); }
  }, [storageKey]);
  const complete = useCallback(async () => {
    // The operation already succeeded remotely: a local cleanup failure must never invite resubmission.
    suppressed.current = true;
    persisted.current = false;
    if (mounted.current) setStatus('');
    baseline.current = draftFingerprint(latest.current.value);
    await serial.current.catch(() => undefined);
    initial.current = latest.current.value;
    if (storageKey) await formDraftStore.removeTree(storageKey).catch(() => { if (mounted.current) setError('Operação concluída. Não foi possível remover o rascunho local; não reenvie esta operação.'); });
    persisted.current = false;
    if (mounted.current) setStatus('');
  }, [storageKey]);
  useEffect(() => {
    if (resetAfterDiscard.current) { suppressed.current = false; resetAfterDiscard.current = false; }
    if (options.reusable && fingerprint !== baseline.current) suppressed.current = false;
  }, [options.reusable, fingerprint]);
  useEffect(() => {
    if (!workspace || !storageKey || !enabled || !ready) return;
    return workspace.register(storageKey, { title, dirty, busy: () => !suppressed.current && latest.current.busy, save, discard });
  }, [workspace, storageKey, enabled, ready, title, dirty, save, discard]);
  useEffect(() => {
    if (!ready || !enabled || !storageKey || !dirty()) return;
    const timer = window.setTimeout(() => { void save().catch(() => undefined); }, 350);
    return () => window.clearTimeout(timer);
  }, [fingerprint, ready, enabled, storageKey, dirty, save]);
  const visibleStatus = status && fingerprint !== savedFingerprint ? 'Alterações aguardando salvamento…' : status;
  return { ready, status: visibleStatus, error, save, complete, discard, close: (action: () => void) => workspace ? workspace.leave(action) : action() };
}
