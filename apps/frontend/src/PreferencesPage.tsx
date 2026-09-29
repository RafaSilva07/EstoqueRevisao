import { FormEvent, useState } from 'react';
import { api, UserPreferences } from './api';
import { Notice, PageHeader } from './components';
import { canvasColor, canvasTextColor } from './ui-preferences';

export function PreferencesPage({ value, onSaved }: { value: UserPreferences; onSaved: (value: UserPreferences) => void }) {
  const [draft, setDraft] = useState<UserPreferences>(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const background = canvasColor(draft);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError(''); setSuccess('');
    try {
      const saved = await api.patch<UserPreferences>('/auth/preferences', draft);
      setDraft(saved);
      onSaved(saved);
      setSuccess('Preferências salvas para sua conta.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível salvar as preferências.');
    } finally {
      setSaving(false);
    }
  }

  return <><PageHeader eyebrow="Sua conta" title="Preferências" description="Personalize a aparência do sistema para a sua conta." />
    {error && <Notice kind="error" onClose={() => setError('')}>{error}</Notice>}
    {success && <Notice kind="success" onClose={() => setSuccess('')}>{success}</Notice>}
    <form className="surface form-panel preferences-panel" onSubmit={(event) => void save(event)}>
      <fieldset className="preferences-themes"><legend>Aparência</legend>
        <label className={draft.theme === 'LIGHT' ? 'selected' : ''}><input type="radio" name="theme" value="LIGHT" checked={draft.theme === 'LIGHT'} onChange={() => setDraft((current) => ({ ...current, theme: 'LIGHT' }))} />Modo claro</label>
        <label className={draft.theme === 'DARK' ? 'selected' : ''}><input type="radio" name="theme" value="DARK" checked={draft.theme === 'DARK'} onChange={() => setDraft((current) => ({ ...current, theme: 'DARK' }))} />Modo escuro</label>
      </fieldset>
      <div className="preferences-background">
        <div><h2>Cor do fundo geral</h2><p className="muted">Escolha qualquer cor. Cartões e campos mantêm contraste próprio para leitura.</p></div>
        <label>Escolher cor<input aria-label="Cor do fundo geral" type="color" value={background} onChange={(event) => setDraft((current) => ({ ...current, backgroundColor: event.target.value.toUpperCase() }))} /></label>
        <button type="button" className="secondary" disabled={draft.backgroundColor === null} onClick={() => setDraft((current) => ({ ...current, backgroundColor: null }))}>Usar fundo padrão</button>
      </div>
      <div className="preferences-preview" style={{ backgroundColor: background, color: canvasTextColor(background) }}>
        <span>Prévia do fundo</span><span className={draft.theme === 'DARK' ? 'preferences-preview-card dark' : 'preferences-preview-card'}>Cartão de conteúdo</span>
      </div>
      <div className="form-actions"><button disabled={saving}>{saving ? 'Salvando…' : 'Salvar preferências'}</button></div>
    </form>
  </>;
}
