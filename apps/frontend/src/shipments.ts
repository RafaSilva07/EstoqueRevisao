import { Batch, Product, StockLocation } from './api';
export type Sector = 'REVISAO' | 'PRODUCAO' | 'EXPEDICAO';
export const sectorLabel: Record<Sector, string> = { REVISAO: 'Revisão', PRODUCAO: 'Produção', EXPEDICAO: 'Expedição' };
export type ShipmentStatus = 'AGUARDANDO_RECEBIMENTO' | 'CONFIRMADO' | 'RECUSADO';
export const shipmentStatusLabel: Record<ShipmentStatus, string> = {
  AGUARDANDO_RECEBIMENTO: 'Aguardando recebimento', CONFIRMADO: 'Confirmado', RECUSADO: 'Recusado',
};
export interface Shipment {
  id: string; originSector: Sector; destinationSector: Sector; status: ShipmentStatus;
  createdAt: string; createdBy: { id: string; username: string };
  decidedAt: string | null; decidedBy: { username: string } | null; refusalReason: string | null;
  items: { id: string; quantity: number; productSnapshot: Pick<Product, 'code' | 'name' | 'defaultUnit'>;
    batch: Batch; stockLocation: StockLocation | null }[];
}
