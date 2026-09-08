import { BadRequestException, Injectable } from '@nestjs/common';
import { MovementReportQueryDto } from './dto/movement-report-query.dto';
import { ReviewReportQueryDto } from './dto/review-report-query.dto';
import { StockReportQueryDto } from './dto/stock-report-query.dto';
import { ReportsRepository } from './reports.repository';
import {
  MovementReportItem,
  MovementReportTotals,
  ReportResult,
  ReviewReportItem,
  ReviewReportTotals,
  StockReportItem,
  StockReportTotals,
} from './report.types';

@Injectable()
export class ReportsService {
  constructor(private readonly repository: ReportsRepository) {}

  movements(query: MovementReportQueryDto): Promise<ReportResult<MovementReportItem, MovementReportTotals>> {
    this.validatePeriod(query.dateFrom, query.dateTo);
    return this.repository.movements(query);
  }

  async movementsCsv(query: MovementReportQueryDto): Promise<string> {
    this.validatePeriod(query.dateFrom, query.dateTo);
    const report = await this.repository.movements(query, false);
    return this.csv([
      'Movimentacao', 'Data/hora', 'Tipo', 'Status', 'Responsavel', 'Origem', 'Destino',
      'Produto', 'Lote origem', 'Lote destino', 'Quantidade', 'Unidade', 'Destinos revisao',
      'Cancelada em', 'Cancelada por', 'Motivo cancelamento',
    ], report.items.map((item) => [
      item.movementId, item.occurredAt, item.type, item.status, item.responsible, item.origin,
      item.destination, `${item.productCode} - ${item.productName}`, item.batchCode,
      item.destinationBatchCode, item.quantity, item.unit, item.reviewDestinations,
      item.canceledAt, item.canceledBy, item.cancellationReason,
    ]));
  }

  reviews(query: ReviewReportQueryDto): Promise<ReportResult<ReviewReportItem, ReviewReportTotals>> {
    this.validatePeriod(query.dateFrom, query.dateTo);
    return this.repository.reviews(query);
  }

  async reviewsCsv(query: ReviewReportQueryDto): Promise<string> {
    this.validatePeriod(query.dateFrom, query.dateTo);
    const report = await this.repository.reviews(query, false);
    return this.csv([
      'Movimentacao', 'Data/hora', 'Produto', 'Lote', 'Classificacao', 'Quantidade',
      'Unidade', 'Responsavel',
    ], report.items.map((item) => [
      item.movementId, item.occurredAt, `${item.productCode} - ${item.productName}`,
      item.batchCode, item.destination, item.quantity, item.unit, item.responsible,
    ]));
  }

  stock(query: StockReportQueryDto): Promise<ReportResult<StockReportItem, StockReportTotals>> {
    this.validateDateRange(query.expirationFrom, query.expirationTo);
    return this.repository.stock(query, this.referenceDate(query));
  }

  async stockCsv(query: StockReportQueryDto): Promise<string> {
    this.validateDateRange(query.expirationFrom, query.expirationTo);
    const report = await this.repository.stock(query, this.referenceDate(query), false);
    return this.csv([
      'Posicao', 'Produto', 'Lote', 'Fabricacao', 'Validade', 'Situacao validade',
      'Local', 'Quantidade', 'Unidade',
    ], report.items.map((item) => [
      item.positionId, `${item.productCode} - ${item.productName}`, item.batchCode,
      item.manufacturingDate, item.expirationDate, item.expirationStatus, item.location,
      item.quantity, item.unit,
    ]));
  }

  private validatePeriod(from?: string, to?: string): void {
    if (from && to && new Date(from).getTime() > new Date(to).getTime()) {
      throw new BadRequestException({
        code: 'INVALID_REPORT_PERIOD',
        message: 'O inicio do periodo nao pode ser posterior ao fim.',
      });
    }
  }

  private validateDateRange(from?: string, to?: string): void {
    if (from && to && from > to) {
      throw new BadRequestException({
        code: 'INVALID_EXPIRATION_RANGE',
        message: 'A validade inicial nao pode ser posterior a validade final.',
      });
    }
  }

  private referenceDate(query: StockReportQueryDto): string {
    return query.referenceDate ?? new Intl.DateTimeFormat('en-CA').format(new Date());
  }

  private csv(headers: string[], rows: Array<Array<string | number | null>>): string {
    const encode = (value: string | number | null): string => {
      const text = value === null ? '' : String(value);
      return `"${text.replaceAll('"', '""')}"`;
    };
    return `\uFEFF${[headers, ...rows].map((row) => row.map(encode).join(';')).join('\r\n')}\r\n`;
  }
}
