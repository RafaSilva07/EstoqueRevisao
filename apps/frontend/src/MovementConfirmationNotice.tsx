import { ApiError } from './api';
import { Notice } from './components';
import { formatDateTime } from './format';

const statusLabels: Record<string, string> = {
  EFETIVADA: 'Concluída', AGUARDANDO_RECEBIMENTO: 'Aguardando recebimento',
  EM_SEPARACAO: 'Em separação', CONFIRMADO: 'Recebimento confirmado',
};

export function MovementConfirmationNotice({ conflict }: { conflict: ApiError | null }) {
  if (!conflict) return null;
  const duplicate = conflict.code === 'RECENT_DUPLICATE_CONFIRMATION_REQUIRED';
  return <Notice kind="info" className={duplicate ? 'notice-duplicate' : ''} title={duplicate ? <span className="duplicate-warning-heading">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 3 22 21H2L12 3Z" strokeLinejoin="round" /><path d="M12 9v5m0 3v1" strokeLinecap="round" /></svg>
    <span>Atenção: possível operação duplicada</span>
  </span> : undefined}>
    {conflict.message}
    {duplicate && <>
      <ul className="duplicate-operation-list">{conflict.details?.duplicates?.map((item) => <li key={`${item.kind}:${item.id}`}>
        <strong>{item.code ?? 'Transferência interna'}</strong>
        <span>{formatDateTime(item.createdAt)} · {item.responsible}</span>
        <small>{statusLabels[item.status] ?? item.status}</small>
      </li>)}</ul>
      <span>Volte para conferir ou confirme abaixo se esta é realmente uma nova operação. Nada foi registrado ainda.</span>
    </>}
  </Notice>;
}
