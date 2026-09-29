import { EmptyState, LoadingState, PageHeader } from './components';
import { formatDateTime } from './format';
import { OnlineUser } from './online-presence';
import { operationalModeLabel } from './operational-mode';

export function PcpOnlineNotice({ users, error }: { users: OnlineUser[]; error: boolean }) {
  if (error) return <p className="presence-unavailable" role="status">Não foi possível atualizar quem está online no PCP.</p>;
  if (!users.length) return null;
  return <aside className="presence-pcp-banner" role="status" aria-live="polite">
    <span className="presence-live-dot" aria-hidden="true" />
    <div>
      <strong>{users.length === 1 ? 'Outro usuário do PCP está online' : 'Outros usuários do PCP estão online'}</strong>
      <p>{users.map((user) => user.username).join(', ')}</p>
      <small>Aviso informativo: confirme com a equipe antes de trabalhar no mesmo registro.</small>
    </div>
  </aside>;
}

export function OnlineUsersPage({ users, loading, error, onRetry }: {
  users: OnlineUser[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  return <>
    <PageHeader eyebrow="Acompanhamento" title="Usuários online" description="Contas com atividade recente no sistema. A presença é informativa e não bloqueia operações." />
    <section className="surface online-users-panel" aria-label="Usuários online">
      <div className="online-users-heading"><h2>Ativos agora</h2><span>{users.length} {users.length === 1 ? 'usuário' : 'usuários'}</span></div>
      {error && <div className="presence-retry" role="status"><span>Não foi possível atualizar a lista de usuários online.</span><button className="secondary" type="button" onClick={onRetry}>Tentar novamente</button></div>}
      {loading ? <LoadingState label="Consultando usuários online" /> : !error && users.length === 0 ? <EmptyState title="Ninguém online no momento" description="Usuários com o sistema aberto e ativo aparecerão aqui." /> : <ul className="online-users-list">{users.map((user) => <li key={user.id}>
        <span className="presence-live-dot" aria-hidden="true" />
        <div className="online-user-identity"><strong>{user.username}</strong><span>{operationalModeLabel[user.mode]}</span></div>
        <small>Última atividade: <time dateTime={user.lastSeenAt}>{formatDateTime(user.lastSeenAt)}</time></small>
      </li>)}</ul>}
    </section>
  </>;
}
