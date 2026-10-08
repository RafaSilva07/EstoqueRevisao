import { ApiError } from './api';
import { Notice } from './components';
import { formatDateTime } from './format';

const statusLabels: Record<string, string> = {
  EFETIVADA: 'Concluída', AGUARDANDO_RECEBIMENTO: 'Aguardando recebimento',
  EM_SEPARACAO: 'Em separação', CONFIRMADO: 'Recebimento confirmado',
};

export function MovementConfirmationNotice({ conflict }: { conflict: ApiError | null }) {
  if (!conflict) return null;
  return <Notice kind="info">
    {conflict.message}
    {conflict.code === 'RECENT_DUPLICATE_CONFIRMATION_REQUIRED' && <>
      <ul className="duplicate-operation-list">{conflict.details?.duplicates?.map((item) => <li key={`${item.kind}:${item.id}`}>
        <strong>{item.code ?? 'Transferência interna'}</strong>
        <span>{formatDateTime(item.createdAt)} · {item.responsible}</span>
        <small>{statusLabels[item.status] ?? item.status}</small>
      </li>)}</ul>
      <span>Volte para conferir ou confirme abaixo se esta é realmente uma nova operação. Nada foi registrado ainda.</span>
    </>}
  </Notice>;
}
