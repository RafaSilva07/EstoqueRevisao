import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, Paginated } from './api';
import { ConfirmDialog, EmptyState, LoadingState, Modal, Notice, PageHeader } from './components';
import { formatDateTime } from './format';
import { sectorLabel, Sector } from './shipments';
import { PermissionChecklist, PermissionOption, PermissionPreset } from './PermissionChecklist';
import { PermissionPresetsModal } from './PermissionPresetsModal';

interface Role { code: string; name: string }
export interface ManagedUser {
  id: string; username: string; sector: Sector; status: 'ACTIVE' | 'INACTIVE';
  roles: Role[]; createdAt: string; updatedAt: string;
  permissionCodes: string[]; presetPermissionCodes: string[]; permissionOverrides: { code: string; allowed: boolean }[];
}
const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'Não foi possível concluir a operação.';

export function UsersPage({ currentUserId, onOwnUpdate }: { currentUserId: string; onOwnUpdate: () => void }) {
  const [result, setResult] = useState<Paginated<ManagedUser>>();
  const [roles, setRoles] = useState<PermissionPreset[]>([]);
  const [permissionOptions, setPermissionOptions] = useState<PermissionOption[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [sector, setSector] = useState<Sector>('REVISAO');
  const [applyPreset, setApplyPreset] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('NAME');
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editing, setEditing] = useState<ManagedUser | null | undefined>();
  const [selected, setSelected] = useState<ManagedUser>();
  const [removing, setRemoving] = useState<ManagedUser>();
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true); setError('');
      void Promise.all([api.get<Paginated<ManagedUser>>(`/users?page=${page}&limit=20&search=${encodeURIComponent(search)}&sort=${sort}`), api.get<PermissionPreset[]>('/users/roles'), api.get<PermissionOption[]>('/users/permissions')])
        .then(([users, availableRoles, permissions]) => { if (active) { setResult(users); setRoles(availableRoles); setPermissionOptions(permissions); } })
        .catch((caught: unknown) => { if (active) setError(messageFrom(caught)); })
        .finally(() => { if (active) setLoading(false); });
    }, 200);
    return () => { active = false; window.clearTimeout(timer); };
  }, [page, search, sort, reload]);

  function openUser(user: ManagedUser | null) {
    setError(''); setEditing(user); setSelectedRoles(user?.roles.map((role) => role.code) ?? []);
    setSelectedPermissions(user?.permissionCodes ?? []); setSector(user?.sector ?? 'REVISAO'); setApplyPreset(false);
  }
  function applyPresetSelection(roleCodes: string[]) {
    const assigned = roles.filter((role) => roleCodes.includes(role.code));
    setSelectedRoles(roleCodes); setSelectedPermissions([...new Set(assigned.flatMap((role) => role.permissionCodes))]); setApplyPreset(true);
    const modes = assigned.flatMap((role) => role.modes);
    if (modes.includes('ADMIN')) setSector('REVISAO');
    else if (modes.length && !modes.includes(sector)) setSector(modes[0] as Sector);
  }
  const permissionModes = selectedRoles.includes('ADMIN') ? ['ADMIN']
    : roles.filter((role) => selectedRoles.includes(role.code) && role.code.startsWith('ADMIN_')).flatMap((role) => role.modes);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = new FormData(event.currentTarget);
    const roleCodes = selectedRoles;
    if (!roleCodes.length) { setError('Selecione ao menos um perfil.'); return; }
    const areaRole = roleCodes.find((code) => code === 'ADMIN_REVISAO_EXPEDICAO' || code === 'ADMIN_PRODUCAO_PCP');
    if (areaRole && roleCodes.length !== 1) { setError('O administrador de área deve utilizar apenas seu perfil administrativo.'); return; }
    if (areaRole === 'ADMIN_REVISAO_EXPEDICAO' && sector !== 'REVISAO' && sector !== 'EXPEDICAO') { setError('Selecione Revisão ou Expedição como setor inicial.'); return; }
    if (areaRole === 'ADMIN_PRODUCAO_PCP' && sector !== 'PRODUCAO' && sector !== 'PCP') { setError('Selecione Produção ou PCP como setor inicial.'); return; }
    if (roleCodes.includes('REVISAO') && sector !== 'REVISAO') { setError('O perfil Revisão operacional deve pertencer ao setor Revisão.'); return; }
    if (roleCodes.includes('PCP') && roleCodes.length > 1) { setError('O perfil PCP deve ser usado sozinho.'); return; }
    if ((roleCodes.includes('PCP') && sector !== 'PCP') || (sector === 'PCP' && !roleCodes.includes('PCP') && areaRole !== 'ADMIN_PRODUCAO_PCP')) { setError('O setor PCP exige o perfil PCP ou Admin Produção e PCP.'); return; }
    submitting.current = true; setBusy(true); setError('');
    try {
      const password = form.get('password') as string;
      const payload = { username: (form.get('username') as string).trim(), sector, roleCodes, permissionCodes: selectedPermissions, applyPreset,
        ...(password ? { password } : {}), ...(editing ? { status: form.get('status') } : {}) };
      if (editing) await api.patch(`/users/${editing.id}`, payload);
      else await api.post('/users', payload);
      if (editing?.id === currentUserId) { onOwnUpdate(); return; }
      setEditing(undefined); setSuccess('Usuário salvo. Alterações encerram as sessões anteriores da conta.');
      setReload((value) => value + 1);
    } catch (caught) { setError(messageFrom(caught)); }
    finally { submitting.current = false; setBusy(false); }
  }

  async function remove() {
    if (!removing || submitting.current) return;
    submitting.current = true; setBusy(true); setError('');
    try {
      await api.delete(`/users/${removing.id}`);
      setRemoving(undefined); setSuccess('Usuário inativado. Acesso bloqueado e histórico preservado.'); setReload((value) => value + 1);
    } catch (caught) { setRemoving(undefined); setError(messageFrom(caught)); }
    finally { submitting.current = false; setBusy(false); }
  }

  return <>
    <PageHeader eyebrow="Administração" title="Gerenciar usuários" description="Gerencie setores e permissões individuais, usando os perfis como presets." action={<div className="row-actions"><button className="secondary" disabled={loading || !roles.length} onClick={() => setShowPresets(true)}>Presets de permissões</button><button disabled={loading || !roles.length} onClick={() => openUser(null)}>Novo usuário</button></div>} />
    {success && <Notice kind="success" onClose={() => setSuccess('')}>{success}</Notice>}
    {error && editing === undefined && <Notice kind="error">{error}</Notice>}
    <section className="surface list-panel">
      <label>Buscar usuário<input type="search" value={search} maxLength={100} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>
      <label>Ordenar por<select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}><option value="NAME">Nome</option><option value="RECENT">Mais recentes</option><option value="OLDEST">Mais antigos</option></select></label>
      {loading ? <LoadingState /> : error ? <button className="secondary" onClick={() => setReload((value) => value + 1)}>Tentar novamente</button> : !result?.items.length ? <EmptyState title="Nenhum usuário encontrado" description="Revise a busca ou cadastre um usuário." /> : <>
        <div className="responsive-table"><table><thead><tr><th>Login</th><th>Setor</th><th>Perfis</th><th>Status</th><th>Ações</th></tr></thead><tbody>
          {result.items.map((user) => <tr key={user.id}>
            <td data-label="Login">{user.username}</td><td data-label="Setor">{sectorLabel[user.sector]}</td>
            <td data-label="Perfis">{user.roles.map((role) => role.name).join(', ')}</td><td data-label="Status">{user.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}</td>
            <td data-label="Ações"><div className="row-actions"><button className="secondary" onClick={() => setSelected(user)}>Ver</button><button className="secondary" onClick={() => openUser(user)}>Editar</button>
              {user.status === 'ACTIVE' && user.id !== currentUserId && <button className="secondary" onClick={() => setRemoving(user)}>Excluir</button>}</div></td>
          </tr>)}
        </tbody></table></div>
        <div className="pagination"><button className="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button><span>Página {page} de {Math.max(1, result.meta.totalPages)} · {result.meta.total} usuários</span><button className="secondary" disabled={page >= result.meta.totalPages} onClick={() => setPage(page + 1)}>Próxima</button></div>
      </>}
    </section>
    {editing !== undefined && <Modal labelledBy="user-form-title" busy={busy} onClose={() => setEditing(undefined)}>
      <h2 id="user-form-title">{editing ? 'Editar usuário' : 'Novo usuário'}</h2>
      {error && <Notice kind="error">{error}</Notice>}
      {editing?.id === currentUserId && <p>Ao salvar sua conta, será necessário entrar novamente.</p>}
      <form className="form-grid" onSubmit={(event) => void save(event)}>
        <label>Login<input name="username" required maxLength={100} defaultValue={editing?.username} autoComplete="off" disabled={busy} /></label>
        <label>{editing ? 'Nova senha (opcional)' : 'Senha'}<input name="password" type="password" required={!editing} minLength={8} maxLength={128} autoComplete="new-password" disabled={busy} /><small>De 8 a 128 caracteres.{editing && ' Deixe em branco para manter a atual.'}</small></label>
        <label>Setor inicial<select name="sector" value={sector} onChange={(event) => setSector(event.target.value as Sector)} disabled={busy}>{Object.entries(sectorLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><small>Admin geral inicia na Revisão; administradores de área escolhem um dos seus setores.</small></label>
        <fieldset className="user-roles" disabled={busy}><legend>Presets de acesso</legend>{roles.map((role) => <label key={role.code}><input type="checkbox" name="roleCodes" value={role.code} checked={selectedRoles.includes(role.code)} onChange={(event) => applyPresetSelection(event.target.checked ? [...selectedRoles, role.code] : selectedRoles.filter((code) => code !== role.code))} />{role.name}</label>)}<small>Selecionar um preset carrega suas permissões. Ajuste as funcionalidades abaixo antes de salvar. Administradores de área e PCP mantêm as combinações de setores existentes.</small></fieldset>
        <section className="wide"><div className="panel-heading"><h3>Permissões deste usuário</h3><button className="secondary" type="button" disabled={busy || !selectedRoles.length} onClick={() => applyPresetSelection(selectedRoles)}>Reaplicar presets atuais</button></div>
          {selectedRoles.includes('ADMIN') && <p>O admin geral mantém acesso completo e é o único que gerencia usuários, presets e configurações gerais.</p>}
          <PermissionChecklist options={permissionOptions} selected={selectedPermissions} modes={permissionModes.length ? permissionModes : [sector]} disabled={busy || selectedRoles.includes('ADMIN')} onChange={setSelectedPermissions} />
        </section>
        {editing && <label>Status<select name="status" defaultValue={editing.status} disabled={busy}><option value="ACTIVE">Ativo</option><option value="INACTIVE">Inativo</option></select></label>}
        <div className="dialog-actions"><button type="button" className="secondary" disabled={busy} onClick={() => setEditing(undefined)}>Voltar</button><button disabled={busy}>{busy ? 'Salvando...' : 'Salvar usuário'}</button></div>
      </form>
    </Modal>}
    {showPresets && <PermissionPresetsModal presets={roles} options={permissionOptions} onClose={() => setShowPresets(false)} onSaved={(updatedUsers) => {
      setShowPresets(false); setSuccess(`Preset salvo. ${updatedUsers} usuário(s) atualizado(s); ajustes individuais preservados.`); setReload((value) => value + 1);
    }} />}
    {selected && <Modal labelledBy="user-detail-title" onClose={() => setSelected(undefined)}>
      <h2 id="user-detail-title">{selected.username}</h2><p>Setor: {sectorLabel[selected.sector]}</p><p>Presets: {selected.roles.map((role) => role.name).join(', ')}</p><p>Status: {selected.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}</p><p>Criado em: {formatDateTime(selected.createdAt)}</p><p>Atualizado em: {formatDateTime(selected.updatedAt)}</p><h3>Funcionalidades permitidas</h3><ul>{permissionOptions.filter((option) => selected.permissionCodes.includes(option.code)).map((option) => <li key={option.code}>{option.label}</li>)}</ul><p>{selected.permissionOverrides.length} ajuste(s) individual(is).</p><button onClick={() => setSelected(undefined)}>Fechar</button>
    </Modal>}
    <ConfirmDialog open={Boolean(removing)} title="Excluir usuário?" description={`A conta ${removing?.username ?? ''} será inativada e suas sessões encerradas. O histórico será preservado. Você poderá reativá-la em Editar.`} confirmLabel="Excluir e bloquear acesso" busy={busy} onConfirm={() => void remove()} onCancel={() => setRemoving(undefined)} />
  </>;
}
