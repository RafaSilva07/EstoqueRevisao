import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, Paginated } from './api';
import { ConfirmDialog, EmptyState, LoadingState, Modal, Notice, PageHeader } from './components';
import { formatDateTime } from './format';
import { sectorLabel, Sector } from './shipments';

interface Role { code: string; name: string }
export interface ManagedUser {
  id: string; username: string; sector: Sector; status: 'ACTIVE' | 'INACTIVE';
  roles: Role[]; createdAt: string; updatedAt: string;
}
const messageFrom = (error: unknown) => error instanceof Error ? error.message : 'Não foi possível concluir a operação.';

export function UsersPage({ currentUserId, onOwnUpdate }: { currentUserId: string; onOwnUpdate: () => void }) {
  const [result, setResult] = useState<Paginated<ManagedUser>>();
  const [roles, setRoles] = useState<Role[]>([]);
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
      void Promise.all([api.get<Paginated<ManagedUser>>(`/users?page=${page}&limit=20&search=${encodeURIComponent(search)}&sort=${sort}`), api.get<Role[]>('/users/roles')])
        .then(([users, availableRoles]) => { if (active) { setResult(users); setRoles(availableRoles); } })
        .catch((caught: unknown) => { if (active) setError(messageFrom(caught)); })
        .finally(() => { if (active) setLoading(false); });
    }, 200);
    return () => { active = false; window.clearTimeout(timer); };
  }, [page, search, sort, reload]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = new FormData(event.currentTarget);
    const roleCodes = form.getAll('roleCodes').map(String);
    if (!roleCodes.length) { setError('Selecione ao menos um perfil.'); return; }
    if (roleCodes.includes('REVISAO') && form.get('sector') !== 'REVISAO') { setError('O perfil Revisão operacional deve pertencer ao setor Revisão.'); return; }
    if (roleCodes.includes('PCP') && roleCodes.length > 1) { setError('O perfil PCP deve ser usado sozinho.'); return; }
    if (roleCodes.includes('PCP') !== (form.get('sector') === 'PCP')) { setError('O setor PCP deve utilizar exclusivamente o perfil PCP.'); return; }
    submitting.current = true; setBusy(true); setError('');
    try {
      const password = form.get('password') as string;
      const payload = { username: (form.get('username') as string).trim(), sector: form.get('sector'), roleCodes,
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
    <PageHeader eyebrow="Administração" title="Gerenciar usuários" description="Gerencie acessos, perfis e setores do sistema." action={<button disabled={loading || !roles.length} onClick={() => { setError(''); setEditing(null); }}>Novo usuário</button>} />
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
            <td data-label="Ações"><div className="row-actions"><button className="secondary" onClick={() => setSelected(user)}>Ver</button><button className="secondary" onClick={() => { setError(''); setEditing(user); }}>Editar</button>
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
        <label>Setor<select name="sector" defaultValue={editing?.sector ?? 'REVISAO'} disabled={busy}>{Object.entries(sectorLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><small>Administradores pertencem à Revisão e podem alternar o modo operacional.</small></label>
        <fieldset className="user-roles" disabled={busy}><legend>Perfis de acesso</legend>{roles.map((role) => <label key={role.code}><input type="checkbox" name="roleCodes" value={role.code} defaultChecked={editing?.roles.some((assigned) => assigned.code === role.code)} />{role.name}</label>)}<small>Revisão operacional permite solicitações, revisão, transferência e consultas. Entrada/saída direta, cancelamentos, inativação de cadastros e usuários exigem Administrador. Para acesso operacional, não marque Administrador junto.</small><small>O setor PCP utiliza exclusivamente o perfil PCP, com leitura global e execução administrativa.</small></fieldset>
        {editing && <label>Status<select name="status" defaultValue={editing.status} disabled={busy}><option value="ACTIVE">Ativo</option><option value="INACTIVE">Inativo</option></select></label>}
        <div className="dialog-actions"><button type="button" className="secondary" disabled={busy} onClick={() => setEditing(undefined)}>Voltar</button><button disabled={busy}>{busy ? 'Salvando...' : 'Salvar usuário'}</button></div>
      </form>
    </Modal>}
    {selected && <Modal labelledBy="user-detail-title" onClose={() => setSelected(undefined)}>
      <h2 id="user-detail-title">{selected.username}</h2><p>Setor: {sectorLabel[selected.sector]}</p><p>Perfis: {selected.roles.map((role) => role.name).join(', ')}</p><p>Status: {selected.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}</p><p>Criado em: {formatDateTime(selected.createdAt)}</p><p>Atualizado em: {formatDateTime(selected.updatedAt)}</p><button onClick={() => setSelected(undefined)}>Fechar</button>
    </Modal>}
    <ConfirmDialog open={Boolean(removing)} title="Excluir usuário?" description={`A conta ${removing?.username ?? ''} será inativada e suas sessões encerradas. O histórico será preservado. Você poderá reativá-la em Editar.`} confirmLabel="Excluir e bloquear acesso" busy={busy} onConfirm={() => void remove()} onCancel={() => setRemoving(undefined)} />
  </>;
}
