import { useEffect, useState } from 'react';
import { api, Movement, Paginated, ReportResult, StockReportItem, StockReportTotals } from './api';
import { EmptyState, LoadingState, Notice, PageHeader } from './components';
import { formatQuantities } from './report-utils';
import { formatDateTime } from './format';

type OperationalHomePageProps = {
  inventory: boolean;
  movementsCreate: boolean;
  movementsRead: boolean;
  onEntry: () => void;
  onExit: () => void;
  onReview: () => void;
  onTransfer: () => void;
  onInventory: () => void;
  onHistory: () => void;
};

const stockLocations = [
  { code: 'REVISAR', label: 'Revisar' },
  { code: 'LATA_BOA', label: 'Lata Boa' },
  { code: 'VAREJO', label: 'Varejo' },
  { code: 'TUF', label: 'TUF' },
] as const;

const movementLabels: Record<Movement['type'], string> = {
  ENTRADA_EXTERNA: 'Entrada externa',
  SAIDA_EXTERNA: 'Saída externa',
  TRANSFERENCIA_INTERNA: 'Transferência interna',
  REVISAO: 'Revisão',
};

function movementRoute(movement: Movement) {
  if (movement.type === 'ENTRADA_EXTERNA') return `Entrada em ${movement.destinationLocation?.name ?? 'estoque'}`;
  if (movement.type === 'SAIDA_EXTERNA') return `Saída de ${movement.originLocation?.name ?? 'estoque'}`;
  return `${movement.originLocation?.name ?? 'Origem'} → ${movement.destinationLocation?.name ?? 'múltiplos destinos'}`;
}

export function OperationalHomePage({
  inventory,
  movementsCreate,
  movementsRead,
  onEntry,
  onExit,
  onReview,
  onTransfer,
  onInventory,
  onHistory,
}: OperationalHomePageProps) {
  const [balances, setBalances] = useState(() => stockLocations.map((location) => ({ ...location, quantities: [] as StockReportTotals['quantityByUnit'] })));
  const [expiration, setExpiration] = useState({ expired: 0, expiringSoon: 0 });
  const [recentMovements, setRecentMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(inventory || movementsRead);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      try {
        const [stockReports, movements] = await Promise.all([
          inventory
            ? Promise.all([
                ...stockLocations.map((location) =>
                  api.get<ReportResult<StockReportItem, StockReportTotals>>(`/reports/stock?limit=1&location=${location.code}`),
                ),
                api.get<ReportResult<StockReportItem, StockReportTotals>>('/reports/stock?limit=1&expirationStatus=VENCIDO'),
                api.get<ReportResult<StockReportItem, StockReportTotals>>('/reports/stock?limit=1&expirationStatus=PROXIMO_VENCIMENTO'),
              ])
            : Promise.resolve([]),
          movementsRead ? api.get<Paginated<Movement>>('/movements?limit=5') : Promise.resolve(null),
        ]);

        if (!active) return;

        if (inventory) {
          setBalances(stockLocations.map((location, index) => ({ ...location, quantities: stockReports[index].totals.quantityByUnit })));
          setExpiration({
            expired: stockReports[stockLocations.length].totals.positions,
            expiringSoon: stockReports[stockLocations.length + 1].totals.positions,
          });
        }
        setRecentMovements(movements?.items ?? []);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar o painel operacional.');
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadDashboard();
    return () => {
      active = false;
    };
  }, [inventory, movementsRead]);

  return (
    <section>
      <PageHeader eyebrow="Início" title="Painel operacional" description="Acompanhe o estoque que exige atenção e acesse as rotinas do dia a dia." />

      <section className="dashboard-section" aria-labelledby="quick-actions-title">
        <div className="dashboard-section-heading">
          <div>
            <span className="eyebrow">Atalhos</span>
            <h2 id="quick-actions-title">Ações rápidas</h2>
          </div>
        </div>
        <div className="quick-actions dashboard-quick-grid">
          {movementsCreate && <button className="quick-action" onClick={onEntry}><span>Entrada</span><small>Registrar recebimento</small></button>}
          {movementsCreate && <button className="quick-action" onClick={onExit}><span>Saída</span><small>Registrar retirada</small></button>}
          {movementsCreate && <button className="quick-action primary-action" onClick={onReview}><span>Revisar</span><small>Classificar produtos</small></button>}
          {movementsCreate && <button className="quick-action" onClick={onTransfer}><span>Transferir</span><small>Mover lote ou local</small></button>}
          {inventory && <button className="quick-action" onClick={onInventory}><span>Consultar estoque</span><small>Ver saldos e validades</small></button>}
        </div>
      </section>

      {loading && <LoadingState label="Carregando informações operacionais..." />}
      {error && <Notice kind="error">{error}</Notice>}

      {!loading && !error && inventory && (
        <>
          <section className="dashboard-section" aria-labelledby="stock-balances-title">
            <div className="dashboard-section-heading">
              <div>
                <span className="eyebrow">Estoque atual</span>
                <h2 id="stock-balances-title">Saldo por classificação</h2>
              </div>
              <button className="text-button" onClick={onInventory}>Ver estoque</button>
            </div>
            <div className="dashboard-balance-grid">
              {balances.map((balance) => (
                <button className="dashboard-balance-card" key={balance.code} onClick={onInventory}>
                  <span>{balance.label}</span>
                  <strong>{formatQuantities(balance.quantities)}</strong>
                </button>
              ))}
            </div>
          </section>

          <section className="dashboard-section" aria-labelledby="expiration-title">
            <div className="dashboard-section-heading">
              <div>
                <span className="eyebrow">Atenção</span>
                <h2 id="expiration-title">Validades</h2>
              </div>
            </div>
            <div className="dashboard-alert-grid">
              <button className="dashboard-alert-card danger" onClick={onInventory}>
                <strong>{expiration.expired}</strong>
                <span>{expiration.expired === 1 ? 'posição vencida' : 'posições vencidas'}</span>
              </button>
              <button className="dashboard-alert-card warning" onClick={onInventory}>
                <strong>{expiration.expiringSoon}</strong>
                <span>{expiration.expiringSoon === 1 ? 'posição próxima do vencimento' : 'posições próximas do vencimento'}</span>
              </button>
            </div>
          </section>
        </>
      )}

      {!loading && !error && movementsRead && (
        <section className="surface dashboard-section dashboard-recent" aria-labelledby="recent-movements-title">
          <div className="dashboard-section-heading">
            <div>
              <span className="eyebrow">Atividade</span>
              <h2 id="recent-movements-title">Movimentações recentes</h2>
            </div>
            <button className="text-button" onClick={onHistory}>Ver histórico</button>
          </div>
          {recentMovements.length === 0 ? (
            <EmptyState title="Nenhuma movimentação registrada" description="As últimas operações aparecerão aqui." />
          ) : (
            <div className="responsive-table">
              <table>
                <thead><tr><th>Data</th><th>Tipo</th><th>Movimentação</th><th>Status</th></tr></thead>
                <tbody>
                  {recentMovements.map((movement) => (
                    <tr key={movement.id}>
                      <td data-label="Data">{formatDateTime(movement.occurredAt)}</td>
                      <td data-label="Tipo">{movementLabels[movement.type]}</td>
                      <td data-label="Movimentação">{movementRoute(movement)}</td>
                      <td data-label="Status"><span className={`badge ${movement.status === 'CANCELADA' ? 'canceled' : 'active'}`}>{movement.status === 'CANCELADA' ? 'Cancelada' : 'Concluída'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </section>
  );
}
