import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Notice } from './components';
import { DraftContext, DraftEntry } from './draft-context';
import { useFormDraft } from './useFormDraft';

export function FormDraftProvider({ children }: { children: ReactNode }) {
  const [scope, setScope] = useState<string | null>(null);
  const entries = useRef(new Map<string, DraftEntry>());
  const [pending, setPending] = useState<{ action: () => void; entries: DraftEntry[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const register = useCallback((key: string, entry: DraftEntry) => { entries.current.set(key, entry); return () => { if (entries.current.get(key) === entry) entries.current.delete(key); }; }, []);
  const flush = useCallback(() => { for (const entry of entries.current.values()) if (entry.dirty()) void entry.save().catch(() => undefined); }, []);
  const leave = useCallback((action: () => void) => {
    if ([...entries.current.values()].some((entry) => entry.busy())) { setError('Aguarde a operação em andamento antes de sair.'); return; }
    const dirty = [...entries.current.values()].filter((entry) => entry.dirty());
    setError('');
    if (dirty.length) setPending({ action, entries: dirty }); else action();
  }, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      const active = [...entries.current.values()];
      if (active.some((entry) => entry.dirty() || entry.busy())) {
        for (const entry of active) if (entry.dirty()) void entry.save().catch(() => undefined);
        event.preventDefault(); event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    window.addEventListener('pagehide', flush);
    const visibility = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', visibility);
    return () => { window.removeEventListener('beforeunload', warn); window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', visibility); };
  }, [flush]);
  async function finish(discard: boolean) {
    if (!pending || saving) return;
    setSaving(true); setError('');
    try {
      await Promise.all(pending.entries.map((entry) => discard ? entry.discard() : entry.save()));
      const action = pending.action; setPending(null); action();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Não foi possível guardar o rascunho. Continue preenchendo e tente novamente.'); }
    finally { setSaving(false); }
  }
  const value = useMemo(() => ({ scope, setScope, register, leave, flush }), [scope, register, leave, flush]);
  return <DraftContext.Provider value={value}><div className="draft-content" inert={Boolean(pending)}>{children}</div>
    {!pending && error && <div className="draft-global-notice"><Notice kind="error" onClose={() => setError('')}>{error}</Notice></div>}
    {pending && <Modal labelledBy="draft-exit-title" busy={saving} onClose={() => setPending(null)} className="draft-exit-dialog">
      <h2 id="draft-exit-title">Guardar o preenchimento?</h2>
      <p>Você pode continuar depois. Salvar o rascunho não confirma nenhuma operação.</p>
      <p className="muted">{[...new Set(pending.entries.map((entry) => entry.title))].join(' · ')}</p>
      {error && <Notice kind="error">{error}</Notice>}
      <div className="dialog-actions"><button type="button" className="secondary" disabled={saving} onClick={() => setPending(null)}>Continuar preenchendo</button><button type="button" className="secondary" disabled={saving} onClick={() => void finish(true)}>Descartar e sair</button><button type="button" disabled={saving} onClick={() => void finish(false)}>{saving ? 'Salvando…' : 'Salvar rascunho e sair'}</button></div>
    </Modal>}
  </DraftContext.Provider>;
}

export function DraftActions({ draft }: { draft: Pick<ReturnType<typeof useFormDraft>, 'status' | 'error' | 'save' | 'ready'> }) {
  return <aside className="draft-toolbar" aria-label="Rascunho do formulário"><div><strong>Rascunho automático</strong><small>{draft.status || 'Disponível neste navegador, para este usuário e modo operacional.'}</small>{draft.error && <span role="alert" className="field-error">{draft.error}</span>}</div><button type="button" className="secondary" disabled={!draft.ready} onClick={() => void draft.save().catch(() => undefined)}>Salvar rascunho</button></aside>;
}
