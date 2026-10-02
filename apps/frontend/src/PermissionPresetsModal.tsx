import { useRef, useState } from 'react';
import { api } from './api';
import { Modal, Notice } from './components';
import { PermissionChecklist, PermissionOption, PermissionPreset } from './PermissionChecklist';

export function PermissionPresetsModal({ presets, options, onClose, onSaved }: {
  presets: PermissionPreset[]; options: PermissionOption[]; onClose: () => void; onSaved: (updatedUsers: number) => void;
}) {
  const [code, setCode] = useState(presets.find((preset) => preset.editable)?.code ?? presets[0]?.code ?? '');
  const preset = presets.find((item) => item.code === code);
  const [selected, setSelected] = useState(preset?.permissionCodes ?? []);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  async function save(applyToUsers: boolean) {
    if (!preset?.editable || submitting.current) return;
    submitting.current = true; setBusy(true); setError('');
    try {
      const known = new Set(options.map((option) => option.code));
      const response = await api.patch<{ updatedUsers: number }>(`/users/roles/${encodeURIComponent(code)}/permissions`, {
        permissionCodes: selected.filter((permission) => known.has(permission)), applyToUsers, version: preset.version,
      });
      onSaved(response.updatedUsers);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Não foi possível salvar o preset.'); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <Modal labelledBy="permission-presets-title" busy={busy} onClose={onClose}>
    <div className="panel-heading"><h2 id="permission-presets-title">Presets de permissões</h2><button className="secondary" disabled={busy} onClick={onClose}>Fechar</button></div>
    {error && <Notice kind="error">{error}</Notice>}
    {confirming && preset ? <>
      <h3>Atualizar também os usuários deste preset?</h3>
      <p>{preset.userCount} usuário(s) utilizam <strong>{preset.name}</strong>.</p>
      <p>Se atualizar, a base de permissões será renovada e os ajustes individuais serão preservados. As sessões desses usuários serão encerradas para aplicar o novo acesso.</p>
      <p>Se salvar somente o preset, os usuários atuais não mudam. Novas atribuições usam a configuração atualizada.</p>
      <div className="dialog-actions preset-confirm-actions">
        <button className="secondary" disabled={busy} onClick={() => setConfirming(false)}>Voltar</button>
        <button className="secondary" disabled={busy} onClick={() => void save(false)}>Salvar só o preset</button>
        <button disabled={busy} onClick={() => void save(true)}>{busy ? 'Salvando...' : 'Salvar e atualizar usuários'}</button>
      </div>
    </> : <>
      <label>Preset<select value={code} onChange={(event) => { const next = presets.find((item) => item.code === event.target.value); setCode(event.target.value); setSelected(next?.permissionCodes ?? []); setError(''); }}>
        {presets.map((item) => <option key={item.code} value={item.code}>{item.name}{item.editable ? '' : ' — acesso completo protegido'}</option>)}
      </select></label>
      {preset && <>
        {!preset.editable && <Notice kind="info">O admin geral mantém acesso completo. Gestão de usuários, presets e configurações gerais continua exclusiva desse perfil.</Notice>}
        <PermissionChecklist options={options} selected={selected} modes={preset.modes} disabled={!preset.editable} onChange={setSelected} />
        <div className="dialog-actions"><button className="secondary" onClick={onClose}>Voltar</button><button disabled={!preset.editable} onClick={() => setConfirming(true)}>Conferir e salvar preset</button></div>
      </>}
    </>}
  </Modal>;
}
