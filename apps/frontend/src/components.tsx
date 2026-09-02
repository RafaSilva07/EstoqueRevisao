import { ReactNode } from 'react';

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return <div className="page-header">
    <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>
    {action && <div className="page-action">{action}</div>}
  </div>;
}

export function Notice({ kind, children, onClose }: {
  kind: 'error' | 'success' | 'info';
  children: ReactNode;
  onClose?: () => void;
}) {
  return <div className={`notice notice-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
    <span>{children}</span>
    {onClose && <button type="button" className="notice-close" aria-label="Fechar mensagem" onClick={onClose}>Fechar</button>}
  </div>;
}

export function LoadingState({ label = 'Carregando...' }: { label?: string }) {
  return <div className="loading-state" role="status"><span className="spinner" aria-hidden="true" /><span>{label}</span></div>;
}

export function EmptyState({ title, description, action }: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return <div className="empty-state"><strong>{title}</strong><p>{description}</p>{action}</div>;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <p className="eyebrow">Confirmacao</p>
      <h2 id="confirm-title">{title}</h2>
      <p>{description}</p>
      <div className="dialog-actions"><button type="button" className="secondary" onClick={onCancel} disabled={busy}>Voltar</button><button type="button" className="danger" onClick={onConfirm} disabled={busy} autoFocus>{busy ? 'Processando...' : confirmLabel}</button></div>
    </section>
  </div>;
}
