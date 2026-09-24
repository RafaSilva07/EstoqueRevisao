import { ReactNode, useEffect, useState } from 'react';
import { api, Movement, Paginated, PcpMovementSummary, UserSession } from './api';
import { EmptyState, LoadingState, Notice } from './components';
import { formatDateTime } from './format';
import { MovementDetailModal } from './MovementDetailModal';
import { SectionMenu } from './Navigation';
import { Page } from './navigation-model';
import { sectorLabel, Shipment, shipmentStatusLabel } from './shipments';

type OperationalHomePageProps = { user: UserSession; navigate: (page: Page) => void };
type MovementSummary = Movement | PcpMovementSummary;

const movementLabels: Record<Movement['type'], string> = {
  ENTRADA_EXTERNA: 'Entrada externa', SAIDA_EXTERNA: 'Saída externa',
  TRANSFERENCIA_INTERNA: 'Transferência interna', REVISAO: 'Revisão',
};

function movementRoute(movement: MovementSummary) {
  if (movement.type === 'ENTRADA_EXTERNA') return `Entrada em ${movement.destinationLocation?.name ?? 'estoque'}`;
  if (movement.type === 'SAIDA_EXTERNA') return `Saída de ${movement.originLocation?.name ?? 'estoque'}`;
  return `${movement.originLocation?.name ?? 'Origem'} → ${movement.destinationLocation?.name ?? 'múltiplos destinos'}`;
}

function itemCount(movement: MovementSummary) { return 'itemCount' in movement ? movement.itemCount : movement.items.length; }
function shipmentRoute(shipment: Shipment) { return `${sectorLabel[shipment.originSector]} → ${sectorLabel[shipment.destinationSector]}`; }
function PanelHeading({ id, eyebrow, title, action }: { id: string; eyebrow: string; title: string; action?: ReactNode }) {
  return <div className="dashboard-section-heading"><div><span className="eyebrow">{eyebrow}</span><h2 id={id}>{title}</h2></div>{action}</div>;
}

export function OperationalHomePage({ user, navigate }: OperationalHomePageProps) {
  const sector = user.sector ?? 'REVISAO';
  const canReadShipments = sector !== 'PCP' && user.permissions.includes('shipments.read');
  const canReadMovements = user.permissions.includes('movements.read');
  const canReadPcp = sector === 'PCP' && user.permissions.includes('pcp.movements.read');
  const [openShipments, setOpenShipments] = useState<Shipment[]>([]);
  const [pendingAcceptance, setPendingAcceptance] = useState(0);
  const [inSeparation, setInSeparation] = useState(0);
  const [pendingPcp, setPendingPcp] = useState<MovementSummary[]>([]);
  const [recentMovements, setRecentMovements] = useState<MovementSummary[]>([]);
  const [recentShipments, setRecentShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedMovement, setSelectedMovement] = useState<Movement | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const shipmentRequests = canReadShipments ? Promise.all([
          api.get<Paginated<Shipment>>('/shipments?view=open&page=1&limit=10'),
          api.get<Paginated<Shipment>>('/shipments?view=pending&status=AGUARDANDO_RECEBIMENTO&page=1&limit=1'),
          api.get<Paginated<Shipment>>('/shipments?view=open&status=EM_SEPARACAO&page=1&limit=1'),
          api.get<Paginated<Shipment>>('/shipments?view=history&page=1&limit=5'),
        ]) : Promise.resolve(null);
        const movementRequests = canReadMovements ? Promise.all([
          api.get<Paginated<Movement>>('/movements?status=EFETIVADA&pcpStatus=PENDENTE&page=1&limit=5'),
          api.get<Paginated<Movement>>('/movements?status=EFETIVADA&page=1&limit=5'),
        ]) : canReadPcp ? Promise.all([
          api.get<Paginated<PcpMovementSummary>>('/pcp/movements?operationalStatus=CONCLUIDA&pcpStatus=PENDENTE&sort=ASC&page=1&limit=5'),
          api.get<Paginated<PcpMovementSummary>>('/pcp/movements?operationalStatus=CONCLUIDA&sort=DESC&page=1&limit=5'),
        ]) : Promise.resolve(null);
        const [shipmentData, movementData] = await Promise.all([shipmentRequests, movementRequests]);
        if (!active) return;
        setOpenShipments(shipmentData?.[0].items ?? []);
        setPendingAcceptance(shipmentData?.[1].meta.total ?? 0);
        setInSeparation(shipmentData?.[2].meta.total ?? 0);
        setRecentShipments(shipmentData?.[3].items ?? []);
        setPendingPcp(movementData?.[0].items ?? []);
        setRecentMovements(movementData?.[1].items ?? []);
        setError('');
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'Não foi possível carregar o resumo operacional.');
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [canReadMovements, canReadPcp, canReadShipments]);

  function openMovement(movement: MovementSummary) {
    if ('items' in movement) setSelectedMovement(movement);
    else navigate(movement.pcpExecutionStatus === 'PENDENTE' ? 'pcp' : 'pcp-all');
  }

  const showAttention = !loading && !error && (pendingAcceptance > 0 || inSeparation > 0);
  return <section className="operational-home">
    {showAttention && <section className="home-attention" aria-labelledby="home-attention-title">
      <div className="home-attention-title"><span className="attention-dot" aria-hidden="true" /><div><span className="eyebrow">Atenção necessária</span><h1 id="home-attention-title">Há atividades aguardando ação</h1></div></div>
      <div className="home-attention-grid">
        {pendingAcceptance > 0 && <button type="button" className="home-attention-card danger" onClick={() => navigate('shipments')}><strong>{pendingAcceptance}</strong><span>{pendingAcceptance === 1 ? 'solicitação aguarda seu aceite' : 'solicitações aguardam seu aceite'}</span><small>Abrir recebimentos →</small></button>}
        {inSeparation > 0 && <button type="button" className="home-attention-card warning" onClick={() => navigate(sector === 'REVISAO' ? 'shipments' : 'shipment-sent')}><strong>{inSeparation}</strong><span>{inSeparation === 1 ? 'movimentação está em separação' : 'movimentações estão em separação'}</span><small>Acompanhar separações →</small></button>}
      </div>
    </section>}

    <SectionMenu page="home" user={user} navigate={navigate} />
    {loading && <LoadingState label="Carregando resumo operacional..." />}
    {error && <Notice kind="error">{error}</Notice>}

    {!loading && !error && canReadShipments && <section className="surface dashboard-section home-operation-panel" aria-labelledby="open-shipments-title">
      <PanelHeading id="open-shipments-title" eyebrow="Prioridade" title="Movimentações em aberto" action={<button className="text-button" onClick={() => navigate('requests')}>Ver solicitações</button>} />
      {openShipments.length === 0 ? <EmptyState title="Nenhuma movimentação em aberto" description="Não há envios aguardando aceite, recebimento ou separação neste setor." /> : <div className="home-operation-list">{openShipments.map((shipment) => <button type="button" className="home-operation-card" key={shipment.id} onClick={() => navigate(shipment.destinationSector === sector ? 'shipments' : 'shipment-sent')}><span className={`badge ${shipment.status === 'EM_SEPARACAO' ? 'pending' : 'warning'}`}>{shipmentStatusLabel[shipment.status]}</span><strong>{shipmentRoute(shipment)}</strong><span>{shipment.items.length} {shipment.items.length === 1 ? 'produto' : 'produtos'} · {shipment.createdBy.username}</span><small>{formatDateTime(shipment.createdAt)} · #{shipment.id.slice(0, 8)}</small></button>)}</div>}
    </section>}

    {!loading && !error && (canReadMovements || canReadPcp) && <section className="surface dashboard-section home-operation-panel" aria-labelledby="pending-pcp-title">
      <PanelHeading id="pending-pcp-title" eyebrow="PCP" title="Finalizadas aguardando execução do PCP" action={<button className="text-button" onClick={() => navigate(canReadPcp ? 'pcp' : 'movements')}>Ver todas</button>} />
      {pendingPcp.length === 0 ? <EmptyState title="Nenhuma movimentação aguardando o PCP" description="As movimentações concluídas pendentes de execução aparecerão aqui." /> : <div className="home-operation-list">{pendingPcp.map((movement) => <button type="button" className="home-operation-card" key={movement.id} onClick={() => openMovement(movement)}><span className="badge pending">PCP pendente</span><strong>{movementLabels[movement.type]}</strong><span>{movementRoute(movement)} · {itemCount(movement)} {itemCount(movement) === 1 ? 'item' : 'itens'}</span><small>{formatDateTime(movement.occurredAt)} · #{movement.id.slice(0, 8)}</small></button>)}</div>}
    </section>}

    {!loading && !error && (canReadMovements || canReadPcp) && <section className="surface dashboard-section home-operation-panel" aria-labelledby="recent-movements-title">
      <PanelHeading id="recent-movements-title" eyebrow="Histórico" title="Últimas movimentações finalizadas" action={<button className="text-button" onClick={() => navigate(canReadPcp ? 'pcp-all' : 'movements')}>Ver histórico</button>} />
      {recentMovements.length === 0 ? <EmptyState title="Nenhuma movimentação finalizada" description="As últimas operações concluídas aparecerão aqui." /> : <div className="home-operation-list">{recentMovements.map((movement) => <button type="button" className="home-operation-card" key={movement.id} onClick={() => openMovement(movement)}><span className="badge active">Concluída</span><strong>{movementLabels[movement.type]}</strong><span>{movementRoute(movement)} · {itemCount(movement)} {itemCount(movement) === 1 ? 'item' : 'itens'}</span><small>{formatDateTime(movement.occurredAt)} · #{movement.id.slice(0, 8)}</small></button>)}</div>}
    </section>}

    {!loading && !error && !canReadMovements && !canReadPcp && canReadShipments && <section className="surface dashboard-section home-operation-panel" aria-labelledby="recent-shipments-title">
      <PanelHeading id="recent-shipments-title" eyebrow="Histórico" title="Últimas movimentações finalizadas" action={<button className="text-button" onClick={() => navigate('shipment-history')}>Ver histórico</button>} />
      {recentShipments.length === 0 ? <EmptyState title="Nenhuma movimentação finalizada" description="Os últimos envios confirmados ou recusados aparecerão aqui." /> : <div className="home-operation-list">{recentShipments.map((shipment) => <button type="button" className="home-operation-card" key={shipment.id} onClick={() => navigate('shipment-history')}><span className={`badge ${shipment.status === 'CONFIRMADO' ? 'active' : 'canceled'}`}>{shipmentStatusLabel[shipment.status]}</span><strong>{shipmentRoute(shipment)}</strong><span>{shipment.items.length} {shipment.items.length === 1 ? 'produto' : 'produtos'} · {shipment.createdBy.username}</span><small>{formatDateTime(shipment.decidedAt ?? shipment.createdAt)} · #{shipment.id.slice(0, 8)}</small></button>)}</div>}
    </section>}
    {selectedMovement && <MovementDetailModal movementId={selectedMovement.id} initialMovement={selectedMovement} onClose={() => setSelectedMovement(null)} />}
  </section>;
}
