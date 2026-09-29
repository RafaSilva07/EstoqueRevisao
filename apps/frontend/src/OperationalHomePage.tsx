import { ReactNode, useEffect, useState } from 'react';
import { api, Movement, Paginated, UserSession } from './api';
import { EmptyState, LoadingState, Notice } from './components';
import { formatDateTime } from './format';
import { MovementDetailModal } from './MovementDetailModal';
import { ShipmentSummaryModal } from './ShipmentSummaryModal';
import { SectionMenu } from './Navigation';
import { Page } from './navigation-model';
import { Shipment, shipmentStatusLabel } from './shipments';
import { HistoryItem } from './HistoryPage';
import { HistoryRecordRow } from './HistoryRecordRow';

type OperationalHomePageProps = { user: UserSession; navigate: (page: Page) => void; onOpenRecord: (page: Page, id: string, recordId?: string) => void };

const movementLabels: Record<Movement['type'], string> = {
  ENTRADA_EXTERNA: 'Entrada externa', SAIDA_EXTERNA: 'Saída externa',
  TRANSFERENCIA_INTERNA: 'Transferência interna', REVISAO: 'Revisão',
};

function PanelHeading({ id, eyebrow, title, action }: { id: string; eyebrow: string; title: string; action?: ReactNode }) {
  return <div className="dashboard-section-heading"><div><span className="eyebrow">{eyebrow}</span><h2 id={id}>{title}</h2></div>{action}</div>;
}

function HomeRecordList({ items, onOpen }: { items: HistoryItem[]; onOpen: (item: HistoryItem) => void }) {
  return <div className="home-operation-list record-list">{items.map((item) => <div className="record-list-entry" key={`${item.kind}:${item.id}`}>
    <HistoryRecordRow item={item} onOpen={() => onOpen(item)} />
    <button type="button" className="home-operation-card record-mobile-card" onClick={() => onOpen(item)}>
      <span className={`badge ${item.scope === 'DONE' ? 'active' : item.scope === 'OPEN' ? 'warning' : 'pending'}`}>
        {item.scope === 'PENDING_PCP' ? 'PCP pendente' : item.scope === 'DONE' ? 'Finalizada' : shipmentStatusLabel[item.status as keyof typeof shipmentStatusLabel] ?? 'Em andamento'}
      </span>
      <strong>{item.kind === 'MOVEMENT' ? `${movementLabels[item.type as Movement['type']] ?? item.type} · ` : ''}{item.productName ?? 'Produto'} · lote {item.batchCode}</strong>
      <span>{item.origin} → {item.destination} · {item.quantity} {item.productUnit}</span>
      <small>{formatDateTime(item.occurredAt)} · {item.code ?? 'Sem código público'}</small>
    </button>
  </div>)}</div>;
}

export function OperationalHomePage({ user, navigate, onOpenRecord }: OperationalHomePageProps) {
  const sector = user.sector ?? 'REVISAO';
  const canReadShipments = sector !== 'PCP' && user.permissions.includes('shipments.read');
  const canReadMovements = user.permissions.includes('movements.read');
  const canReadPcp = sector === 'PCP' && user.permissions.includes('pcp.movements.read');
  const [openShipments, setOpenShipments] = useState<HistoryItem[]>([]);
  const [pendingAcceptance, setPendingAcceptance] = useState(0);
  const [inSeparation, setInSeparation] = useState(0);
  const [pendingPcp, setPendingPcp] = useState<HistoryItem[]>([]);
  const [recentFinished, setRecentFinished] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedMovement, setSelectedMovement] = useState<HistoryItem | null>(null);

  const [selectedShipmentId, setSelectedShipmentId] = useState<string | null>(null);
  const [selectedShipmentRecordId, setSelectedShipmentRecordId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const shipmentRequests = canReadShipments ? Promise.all([
          api.get<Paginated<HistoryItem>>('/history?scope=OPEN&kind=SHIPMENT&page=1&limit=10'),
          api.get<Paginated<Shipment>>('/shipments?view=pending&status=AGUARDANDO_RECEBIMENTO&page=1&limit=1'),
          api.get<Paginated<Shipment>>('/shipments?view=open&status=EM_SEPARACAO&page=1&limit=1'),
        ]) : Promise.resolve(null);
        const movementRequests = canReadMovements || canReadPcp ? Promise.all([
          api.get<Paginated<HistoryItem>>('/history?scope=PENDING_PCP&sort=OLDEST&page=1&limit=5'),
        ]) : Promise.resolve(null);
        const finishedRequest = canReadShipments || canReadMovements || canReadPcp
          ? api.get<Paginated<HistoryItem>>('/history?scope=DONE&page=1&limit=5') : Promise.resolve(null);
        const [shipmentData, movementData, finishedData] = await Promise.all([shipmentRequests, movementRequests, finishedRequest]);
        if (!active) return;
        setOpenShipments(shipmentData?.[0].items ?? []);
        setPendingAcceptance(shipmentData?.[1].meta.total ?? 0);
        setInSeparation(shipmentData?.[2].meta.total ?? 0);
        setPendingPcp(movementData?.[0].items ?? []);
        setRecentFinished(finishedData?.items ?? []);
        setError('');
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'Não foi possível carregar o resumo operacional.');
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [canReadMovements, canReadPcp, canReadShipments]);

  function openMovement(movement: HistoryItem) {
    if (movement.kind === 'SHIPMENT') {
      setSelectedShipmentId(movement.groupId ?? movement.id);
      setSelectedShipmentRecordId(movement.recordId ?? null);
    } else setSelectedMovement(movement);
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
      <PanelHeading id="open-shipments-title" eyebrow="Prioridade" title="Envios em aberto" action={<button className="text-button" onClick={() => navigate('shipments')}>Ver envios</button>} />
      {openShipments.length === 0 ? <EmptyState title="Nenhuma movimentação em aberto" description="Não há envios aguardando aceite, recebimento ou separação neste setor." /> : <HomeRecordList items={openShipments} onOpen={openMovement} />}
    </section>}

    {!loading && !error && (canReadMovements || canReadPcp) && <section className="surface dashboard-section home-operation-panel" aria-labelledby="pending-pcp-title">
      <PanelHeading id="pending-pcp-title" eyebrow="PCP" title="Concluídas no estoque · aguardando PCP" action={<button className="text-button" onClick={() => navigate(canReadPcp ? 'pcp' : 'history')}>Ver todas</button>} />
      {pendingPcp.length === 0 ? <EmptyState title="Nenhuma movimentação aguardando o PCP" description="As movimentações concluídas pendentes de execução aparecerão aqui." /> : <HomeRecordList items={pendingPcp} onOpen={openMovement} />}
    </section>}

    {!loading && !error && (canReadShipments || canReadMovements || canReadPcp) && <section className="surface dashboard-section home-operation-panel" aria-labelledby="recent-finished-title">
      <PanelHeading id="recent-finished-title" eyebrow="Histórico" title="Últimas movimentações finalizadas" action={<button className="text-button" onClick={() => navigate('history')}>Ver histórico</button>} />
      {recentFinished.length === 0 ? <EmptyState title="Nenhuma movimentação finalizada" description="Somente operações sem ação pendente aparecerão aqui." /> : <HomeRecordList items={recentFinished} onOpen={openMovement} />}
    </section>}
    {selectedMovement && <MovementDetailModal movementId={selectedMovement.groupId ?? selectedMovement.id} recordId={selectedMovement.recordId} onSelectRecord={(id) => setSelectedMovement((current) => current ? { ...current, recordId: id } : null)} onViewGroup={() => setSelectedMovement((current) => current ? { ...current, recordId: undefined } : null)} pcp={canReadPcp} onClose={() => setSelectedMovement(null)}>{(movement) => <button className="button-wide" onClick={() => { const recordId = selectedMovement.recordId; setSelectedMovement(null); if (canReadPcp) onOpenRecord('pcp-all', recordId ?? movement.id); else onOpenRecord('history', movement.id, recordId); }}>{canReadPcp && user.permissions.includes('pcp.movements.execute') && movement.status === 'EFETIVADA' && movement.requiresPcpExecution && selectedMovement.pcpExecutionStatus === 'PENDENTE' ? 'Executar registro no PCP' : 'Ver detalhes completos'}</button>}</MovementDetailModal>}
    {selectedShipmentId && <ShipmentSummaryModal id={selectedShipmentId} user={user} recordId={selectedShipmentRecordId} onSelectRecord={setSelectedShipmentRecordId} onViewGroup={() => setSelectedShipmentRecordId(null)} onClose={() => { setSelectedShipmentId(null); setSelectedShipmentRecordId(null); }} onOpen={(id) => { setSelectedShipmentId(null); onOpenRecord('shipments', id); }} />}
  </section>;
}
