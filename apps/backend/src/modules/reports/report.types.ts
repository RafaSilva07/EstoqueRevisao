import { PaginationMeta } from '../../shared/pagination/paginated-result.interface';
import { MovementStatus } from '../movements/domain/movement-status.enum';
import { MovementType } from '../movements/domain/movement-type.enum';
import { ExpirationStatus } from './dto/stock-report-query.dto';

export interface QuantityByUnit {
  unit: string;
  quantity: number;
}

export interface ReportResult<T, TTotals> {
  items: T[];
  meta: PaginationMeta;
  totals: TTotals;
}

export interface MovementReportItem {
  itemId: string;
  movementId: string;
  occurredAt: string;
  type: MovementType;
  status: MovementStatus;
  responsibleUserId: string;
  responsible: string;
  originLocationId: string;
  origin: string;
  destinationLocationId: string | null;
  destination: string;
  productId: string;
  productCode: string;
  productName: string;
  batchId: string;
  batchCode: string;
  destinationBatchId: string | null;
  destinationBatchCode: string | null;
  quantity: number;
  unit: string;
  reviewDestinations: string;
  canceledAt: string | null;
  canceledBy: string | null;
  cancellationReason: string | null;
}

export interface MovementReportTotals {
  rows: number;
  movements: number;
  effectiveMovements: number;
  canceledMovements: number;
  effectiveQuantityByUnit: QuantityByUnit[];
}

export interface ReviewReportItem {
  distributionId: string;
  movementId: string;
  occurredAt: string;
  productId: string;
  productCode: string;
  productName: string;
  batchId: string;
  batchCode: string;
  destinationLocationId: string;
  destination: string;
  quantity: number;
  unit: string;
  responsible: string;
}

export interface ReviewClassificationTotal extends QuantityByUnit {
  destinationLocationId: string;
  destination: string;
}

export interface ReviewReportTotals {
  rows: number;
  reviewedQuantityByUnit: QuantityByUnit[];
  byClassification: ReviewClassificationTotal[];
}

export interface StockReportItem {
  positionId: string;
  productId: string;
  productCode: string;
  productName: string;
  batchId: string;
  batchCode: string;
  manufacturingDate: string;
  expirationDate: string;
  stockLocationId: string;
  location: string;
  quantity: number;
  unit: string;
  expirationStatus: ExpirationStatus;
}

export interface StockReportTotals {
  positions: number;
  quantityByUnit: QuantityByUnit[];
}
