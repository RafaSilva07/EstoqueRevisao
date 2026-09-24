import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, OperationalSettings, Paginated, StockLocation } from './api';
import { LoadingState, Notice, PageHeader } from './components';

export function SettingsPage() {
  const [settings, setSettings] = useState<OperationalSettings | null>(null);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [minutes, setMinutes] = useState(''); const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); const [success, setSuccess] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [configuration, locationData] = await Promise.all([
        api.get<OperationalSettings>('/settings'), api.get<Paginated<StockLocation>>('/stocks?limit=100&active=true'),
      ]);
      setSettings(configuration); setMinutes(String(configuration.immediateSeparationMinutes));
      setSelected(configuration.reviewDestinations.map((item) => item.id));
      setLocations(locationData.items.filter((item) => item.kind !== 'EXTERNAL' && !item.sector && item.reviewRole !== 'SOURCE'));
      setError('');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Nao foi possivel carregar as configuracoes.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  async function saveTimeout(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await api.patch('/settings/immediate-separation', { minutes: Number(minutes) }); setSuccess('Prazo atualizado para novas separacoes.'); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Nao foi possivel salvar o prazo.'); }
    finally { setBusy(false); }
  }
  async function saveDestinations(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await api.patch('/settings/review-destinations', { stockLocationIds: selected }); setSuccess('Destinos da revisao atualizados.'); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Nao foi possivel salvar os destinos.'); }
    finally { setBusy(false); }
  }
  if (loading && !settings) return <LoadingState label="Carregando configuracoes" />;
  return <><PageHeader eyebrow="Administracao" title="Configuracoes" description="Parametros operacionais aplicados somente a novos processos." />
    {error && <Notice kind="error">{error}</Notice>}{success && <Notice kind="success" onClose={() => setSuccess('')}>{success}</Notice>}
    <div className="settings-grid">
      <form className="surface form-panel" onSubmit={(event) => void saveTimeout(event)}><h2>Separacao imediata</h2><p className="muted">O prazo e capturado quando cada separacao comeca.</p>
        <label>Prazo para conclusao (minutos)<input type="number" min="5" max="1440" step="1" value={minutes} onChange={(event) => setMinutes(event.target.value)} required /></label>
        <button disabled={busy}>Salvar prazo</button></form>
      <form className="surface form-panel" onSubmit={(event) => void saveDestinations(event)}><h2>Processo de Revisao</h2><p className="muted">Selecione um ou mais depositos internos ja cadastrados.</p>
        <fieldset className="settings-options"><legend>Destinos oferecidos na revisao</legend>{locations.map((location) => <label key={location.id} className="check-row"><input type="checkbox" checked={selected.includes(location.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, location.id] : current.filter((id) => id !== location.id))} /><span>{location.code} — {location.name}</span></label>)}</fieldset>
        <button disabled={busy || selected.length === 0}>Salvar destinos</button></form>
    </div></>;
}
