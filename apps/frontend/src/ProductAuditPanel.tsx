import { useCallback, useEffect, useState } from 'react';
import { api, Paginated } from './api';
import { LoadingState, Modal, Notice } from './components';
import { formatDateTime } from './format';

interface ProductAuditEntry {
  id: string;
  productId: string;
  action: 'PRODUCT_CREATE' | 'PRODUCT_UPDATE' | 'PRODUCT_ACTIVATE' | 'PRODUCT_DEACTIVATE';
  username: string | null;
  createdAt: string;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
}

const actionLabels: Record<ProductAuditEntry['action'], string> = {
  PRODUCT_CREATE: 'Cadastro',
  PRODUCT_UPDATE: 'Edição',
  PRODUCT_ACTIVATE: 'Reativação',
  PRODUCT_DEACTIVATE: 'Exclusão (inativação)',
};

export function ProductAuditPanel() {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Paginated<ProductAuditEntry> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      setResult(await api.get<Paginated<ProductAuditEntry>>(`/products/audit-history?${params}`));
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível consultar a auditoria.');
    } finally {
      setLoading(false);
    }
  }, [page]);
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [open, load]);

  return <>
    <button type="button" className="secondary" onClick={() => { setLoading(true); setOpen(true); }}>Ver log de produtos (admin)</button>
    {open && <Modal labelledBy="product-audit-title" onClose={() => setOpen(false)} className="product-audit-dialog">
      <h2 id="product-audit-title">Log de produtos</h2>
      <p className="muted">Ações registradas com usuário, data e alterações. A exclusão mantém o histórico e inativa o produto.</p>
      {error && <Notice kind="error">{error} <button className="secondary" onClick={() => { setLoading(true); void load(); }}>Tentar novamente</button></Notice>}
      {loading ? <LoadingState label="Consultando log" /> : result?.items.length === 0 ? <p>Nenhuma ação registrada.</p> : <ul className="product-audit-list">
        {result?.items.map((event) => <li key={event.id}>
          <strong>{actionLabels[event.action] ?? event.action}</strong>
          <span>{event.username ?? 'Usuário não disponível'} · {formatDateTime(event.createdAt)}</span>
          <small>Produto {typeof event.newValues?.code === 'string' ? event.newValues.code : typeof event.oldValues?.code === 'string' ? event.oldValues.code : event.productId}</small>
          {event.action === 'PRODUCT_UPDATE' && <details><summary>Ver antes e depois</summary><pre>Antes: {JSON.stringify(event.oldValues, null, 2)}{'\n'}Depois: {JSON.stringify(event.newValues, null, 2)}</pre></details>}
        </li>)}
      </ul>}
      {result && result.meta.totalPages > 1 && <div className="shipment-pagination"><button className="secondary" disabled={page <= 1 || loading} onClick={() => { setLoading(true); setPage(page - 1); }}>Anterior</button><span>Página {page} de {result.meta.totalPages}</span><button className="secondary" disabled={page >= result.meta.totalPages || loading} onClick={() => { setLoading(true); setPage(page + 1); }}>Próxima</button></div>}
      <button className="secondary" onClick={() => setOpen(false)}>Fechar</button>
    </Modal>}
  </>;
}
