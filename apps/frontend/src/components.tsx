import { ReactNode, useEffect, useRef } from 'react';

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
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (kind !== 'error') return;
    const bounds = ref.current?.getBoundingClientRect();
    if (bounds && (bounds.top < 80 || bounds.bottom > window.innerHeight - 90)) {
      ref.current?.scrollIntoView({ block: 'center' });
    }
  }, [kind, children]);
  return <div ref={ref} className={`notice notice-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
    <span><strong className="notice-title">{kind === 'error' ? 'Não foi possível concluir' : kind === 'success' ? 'Concluído' : 'Atenção'}</strong>{children}</span>
    {onClose && <button type="button" className="notice-close" aria-label="Fechar mensagem" onClick={onClose}>Fechar</button>}
  </div>;
}

export function Modal({ children, labelledBy, busy = false, className = '', onClose }: {
  children: ReactNode;
  labelledBy: string;
  busy?: boolean;
  className?: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const returnFocus = useRef(typeof document === 'undefined' ? null : document.activeElement as HTMLElement | null);
  useEffect(() => {
    const previous = returnFocus.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const dialog = ref.current;
    if (dialog && !dialog.contains(document.activeElement)) dialog.focus();
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus({ preventScroll: true });
    };
  }, []);
  return <div className="dialog-backdrop" onMouseDown={(event) => {
    if (event.target === event.currentTarget && !busy) onClose();
  }}>
    <section ref={ref} className={`dialog confirmation-dialog ${className}`.trim()} role="dialog" aria-modal="true" aria-labelledby={labelledBy} aria-busy={busy} tabIndex={-1} onKeyDown={(event) => {
      if (event.key === 'Escape') { event.stopPropagation(); if (!busy) onClose(); }
      if (event.key !== 'Tab') return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')).filter((node) => node.getClientRects().length > 0);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { event.preventDefault(); first.focus(); }
    }}>{children}</section>
  </div>;
}

export function OperationGuide({ review = false }: { review?: boolean }) {
  return <div className="operation-guide">
    <ol aria-label="Étapes de l’opération"><li>{review ? 'Selecionar' : 'Origem e destino'}</li><li>{review ? 'Distribuir' : 'Adicionar itens'}</li><li>Conferir e confirmar</li></ol>
    <p><span className="required">*</span> Campos obrigatórios. Confira o resumo antes de confirmar.</p>
  </div>;
}

export function FilterPanel({ children, count = 0 }: { children: ReactNode; count?: number }) {
  return <details className="surface filter-disclosure"><summary>Filtros <span>{count ? `${count} aplicado(s)` : 'Todos os registros'}</span></summary><div className="filter-content">{children}</div></details>;
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
  return <Modal labelledBy="confirm-title" busy={busy} onClose={onCancel}>
      <p className="eyebrow">Confirmação</p>
      <h2 id="confirm-title">{title}</h2>
      <p>{description}</p>
      <div className="dialog-actions"><button type="button" className="secondary" onClick={onCancel} disabled={busy}>Voltar</button><button type="button" className="danger" onClick={onConfirm} disabled={busy}>{busy ? 'Processando...' : confirmLabel}</button></div>
  </Modal>;
}
