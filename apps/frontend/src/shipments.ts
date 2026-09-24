import { Batch, Product, StockLocation } from './api';
export type Sector = 'REVISAO' | 'PRODUCAO' | 'EXPEDICAO' | 'PCP';
export type ShipmentSector = Exclude<Sector, 'PCP'>;
export const sectorLabel: Record<Sector, string> = { REVISAO: 'Revisão', PRODUCAO: 'Produção', EXPEDICAO: 'Expedição', PCP: 'PCP' };
export type ShipmentStatus = 'AGUARDANDO_RECEBIMENTO' | 'EM_SEPARACAO' | 'CONFIRMADO' | 'RECUSADO' | 'CANCELADO';
export const shipmentStatusLabel: Record<ShipmentStatus, string> = {
  AGUARDANDO_RECEBIMENTO: 'Aguardando recebimento', EM_SEPARACAO: 'Em separação pela Revisão', CONFIRMADO: 'Confirmado', RECUSADO: 'Recusado', CANCELADO: 'Cancelado pelo remetente',
};
export interface ShipmentAuditEvent {
  id: string; action: string; createdAt: string;
  user: { id: string; username: string } | null;
  newValues: Record<string, unknown> | null;
}
export interface Shipment {
  codigoMovimentacao: string;
  movements?: Array<{ id: string; codigoMovimentacao: string | null; pcpExecutionStatus: 'PENDENTE' | 'EXECUTADA'; requiresPcpExecution: boolean }>;

  id: string; originSector: ShipmentSector; destinationSector: ShipmentSector; status: ShipmentStatus;
  shipmentKind: 'NORMAL' | 'RETORNO_IMEDIATO'; sourceShipmentId: string | null;
  derivedShipments?: Array<{ id: string; status: ShipmentStatus }>;
  receivedAt: string | null; separationStartedAt: string | null; separationExpiresAt: string | null; separationCompletedAt: string | null;
  observation: string | null;
  createdAt: string; createdBy: { id: string; username: string };
  decidedAt: string | null; decidedBy: { username: string } | null; refusalReason: string | null;
  items: { id: string; quantity: number; productSnapshot: Pick<Product, 'code' | 'name' | 'defaultUnit'>;
    batch: Batch; stockLocation: StockLocation | null; observation: string | null; photoMimeType: string | null; photoSize: number | null;
    separationDraft?: { returnQuantity: number } | null }[];
}
