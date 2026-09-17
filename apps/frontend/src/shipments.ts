import { Batch, Product, StockLocation } from './api';
export type Sector = 'REVISAO' | 'PRODUCAO' | 'EXPEDICAO' | 'PCP';
export type ShipmentSector = Exclude<Sector, 'PCP'>;
export const sectorLabel: Record<Sector, string> = { REVISAO: 'Revisão', PRODUCAO: 'Produção', EXPEDICAO: 'Expedição', PCP: 'PCP' };
export type ShipmentStatus = 'AGUARDANDO_RECEBIMENTO' | 'CONFIRMADO' | 'RECUSADO';
export const shipmentStatusLabel: Record<ShipmentStatus, string> = {
  AGUARDANDO_RECEBIMENTO: 'Aguardando recebimento', CONFIRMADO: 'Confirmado', RECUSADO: 'Recusado',
};
export interface Shipment {
  id: string; originSector: ShipmentSector; destinationSector: ShipmentSector; status: ShipmentStatus;
  observation: string | null;
  createdAt: string; createdBy: { id: string; username: string };
  decidedAt: string | null; decidedBy: { username: string } | null; refusalReason: string | null;
  items: { id: string; quantity: number; productSnapshot: Pick<Product, 'code' | 'name' | 'defaultUnit'>;
    batch: Batch; stockLocation: StockLocation | null; observation: string | null; photoMimeType: string | null; photoSize: number | null }[];
}
