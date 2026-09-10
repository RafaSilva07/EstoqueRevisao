import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { MovementItemDistributionEntity } from '../movements/entities/movement-item-distribution.entity';
import { MovementItemEntity } from '../movements/entities/movement-item.entity';
import { MovementStatus } from '../movements/domain/movement-status.enum';
import { MovementType } from '../movements/domain/movement-type.enum';
import { StockPositionEntity } from '../stocks/entities/stock-position.entity';
import { StockLocationEntity } from '../stocks/entities/stock-location.entity';
import { ReviewLocationRole } from '../stocks/domain/review-location-role.enum';
import { PaginationMeta } from '../../shared/pagination/paginated-result.interface';
import { ExpirationStatus, StockReportQueryDto } from './dto/stock-report-query.dto';
import { MovementReportQueryDto } from './dto/movement-report-query.dto';
import { ReviewReportQueryDto } from './dto/review-report-query.dto';
import {
  MovementReportItem,
  MovementReportTotals,
  QuantityByUnit,
  ReportResult,
  ReviewClassificationTotal,
  ReviewReportItem,
  ReviewReportTotals,
  StockReportItem,
  StockReportTotals,
} from './report.types';

type RawValues = Record<string, string | Date | null>;

@Injectable()
export class ReportsRepository {
  constructor(
    @InjectRepository(MovementItemEntity)
    private readonly movementItems: Repository<MovementItemEntity>,
    @InjectRepository(MovementItemDistributionEntity)
    private readonly distributions: Repository<MovementItemDistributionEntity>,
    @InjectRepository(StockPositionEntity)
    private readonly stockPositions: Repository<StockPositionEntity>,
    @InjectRepository(StockLocationEntity)
    private readonly stockLocations: Repository<StockLocationEntity>,
  ) {}

  async movements(
    query: MovementReportQueryDto,
    paginated = true,
  ): Promise<ReportResult<MovementReportItem, MovementReportTotals>> {
    const rowsBuilder = this.applyMovementFilters(this.movementBuilder(), query)
      .select('item.id', 'itemId')
      .addSelect('movement.id', 'movementId')
      .addSelect('movement.occurredAt', 'occurredAt')
      .addSelect('movement.type', 'type')
      .addSelect('movement.status', 'status')
      .addSelect('responsible.id', 'responsibleUserId')
      .addSelect('responsible.username', 'responsible')
      .addSelect('origin.id', 'originLocationId')
      .addSelect('origin.name', 'origin')
      .addSelect('destination.id', 'destinationLocationId')
      .addSelect(`COALESCE(destination.name, 'Varios destinos')`, 'destination')
      .addSelect('product.id', 'productId')
      .addSelect(`COALESCE(item.product_snapshot->>'code', product.code)`, 'productCode')
      .addSelect(`COALESCE(item.product_snapshot->>'name', product.name)`, 'productName')
      .addSelect('batch.id', 'batchId')
      .addSelect('batch.code', 'batchCode')
      .addSelect('batch.manufacturingDate', 'manufacturingDate')
      .addSelect('batch.expirationDate', 'expirationDate')
      .addSelect('destinationBatch.id', 'destinationBatchId')
      .addSelect('destinationBatch.code', 'destinationBatchCode')
      .addSelect('destinationBatch.manufacturingDate', 'destinationManufacturingDate')
      .addSelect('destinationBatch.expirationDate', 'destinationExpirationDate')
      .addSelect('item.quantity', 'quantity')
      .addSelect(`COALESCE(item.product_snapshot->>'defaultUnit', product.default_unit)`, 'unit')
      .addSelect(`(
        SELECT COALESCE(string_agg(report_location.name, ' | ' ORDER BY report_location.name), '')
        FROM movement_item_distributions report_distribution
        INNER JOIN stock_locations report_location
          ON report_location.id = report_distribution.destination_location_id
        WHERE report_distribution.movement_item_id = item.id
      )`, 'reviewDestinations')
      .addSelect('movement.canceledAt', 'canceledAt')
      .addSelect('canceledBy.username', 'canceledBy')
      .addSelect('movement.cancellationReason', 'cancellationReason')
      .orderBy('movement.occurredAt', 'DESC')
      .addOrderBy('movement.id', 'ASC')
      .addOrderBy('item.id', 'ASC');
    if (paginated) {
      rowsBuilder.offset((query.page - 1) * query.limit).limit(query.limit);
    }

    const summaryBuilder = this.applyMovementFilters(this.movementBuilder(), query)
      .select('COUNT(item.id)', 'rows')
      .addSelect('COUNT(DISTINCT movement.id)', 'movements')
      .addSelect(
        `COUNT(DISTINCT movement.id) FILTER (WHERE movement.status = '${MovementStatus.Effective}')`,
        'effectiveMovements',
      )
      .addSelect(
        `COUNT(DISTINCT movement.id) FILTER (WHERE movement.status = '${MovementStatus.Canceled}')`,
        'canceledMovements',
      );
    const unitsBuilder = this.applyMovementFilters(this.movementBuilder(), query)
      .select(`COALESCE(item.product_snapshot->>'defaultUnit', product.default_unit)`, 'unit')
      .addSelect('COALESCE(SUM(item.quantity), 0)', 'quantity')
      .andWhere('movement.status = :effectiveStatus', { effectiveStatus: MovementStatus.Effective })
      .groupBy(`COALESCE(item.product_snapshot->>'defaultUnit', product.default_unit)`)
      .orderBy(`COALESCE(item.product_snapshot->>'defaultUnit', product.default_unit)`, 'ASC');

    const [rawRows, summary, rawUnits] = await Promise.all([
      rowsBuilder.getRawMany<RawValues>(),
      summaryBuilder.getRawOne<RawValues>(),
      unitsBuilder.getRawMany<RawValues>(),
    ]);
    const total = this.number(summary?.rows);
    return {
      items: rawRows.map((row) => this.movementRow(row)),
      meta: this.meta(query.page, query.limit, total),
      totals: {
        rows: total,
        movements: this.number(summary?.movements),
        effectiveMovements: this.number(summary?.effectiveMovements),
        canceledMovements: this.number(summary?.canceledMovements),
        effectiveQuantityByUnit: rawUnits.map((row) => this.quantityByUnit(row)),
      },
    };
  }

  async reviews(
    query: ReviewReportQueryDto,
    paginated = true,
  ): Promise<ReportResult<ReviewReportItem, ReviewReportTotals>> {
    const rowsBuilder = this.applyReviewFilters(this.reviewBuilder(), query)
      .select('distribution.id', 'distributionId')
      .addSelect('movement.id', 'movementId')
      .addSelect('movement.occurredAt', 'occurredAt')
      .addSelect('product.id', 'productId')
      .addSelect(`COALESCE(item.product_snapshot->>'code', product.code)`, 'productCode')
      .addSelect(`COALESCE(item.product_snapshot->>'name', product.name)`, 'productName')
      .addSelect('batch.id', 'batchId')
      .addSelect('batch.code', 'batchCode')
      .addSelect('batch.manufacturingDate', 'manufacturingDate')
      .addSelect('batch.expirationDate', 'expirationDate')
      .addSelect('destination.id', 'destinationLocationId')
      .addSelect('destination.name', 'destination')
      .addSelect('distribution.quantity', 'quantity')
      .addSelect(`COALESCE(item.product_snapshot->>'defaultUnit', product.default_unit)`, 'unit')
      .addSelect('responsible.username', 'responsible')
      .orderBy('movement.occurredAt', 'DESC')
      .addOrderBy('movement.id', 'ASC')
      .addOrderBy(`COALESCE(item.product_snapshot->>'name', product.name)`, 'ASC')
      .addOrderBy('destination.name', 'ASC')
      .addOrderBy('distribution.id', 'ASC');
    if (paginated) {
      rowsBuilder.offset((query.page - 1) * query.limit).limit(query.limit);
    }
    const totalsBuilder = this.applyReviewFilters(this.reviewBuilder(), query)
      .select('destination.id', 'destinationLocationId')
      .addSelect('destination.code', 'destinationCode')
      .addSelect('destination.name', 'destination')
      .addSelect(`COALESCE(item.product_snapshot->>'defaultUnit', product.default_unit)`, 'unit')
      .addSelect('COUNT(distribution.id)', 'rows')
      .addSelect('COALESCE(SUM(distribution.quantity), 0)', 'quantity')
      .groupBy('destination.id')
      .addGroupBy('destination.code')
      .addGroupBy('destination.name')
      .addGroupBy(`COALESCE(item.product_snapshot->>'defaultUnit', product.default_unit)`)
      .orderBy('destination.name', 'ASC')
      .addOrderBy(`COALESCE(item.product_snapshot->>'defaultUnit', product.default_unit)`, 'ASC');

    const classificationsBuilder = this.stockLocations.createQueryBuilder('classification')
      .select('classification.id', 'destinationLocationId')
      .addSelect('classification.code', 'destinationCode')
      .addSelect('classification.name', 'destination')
      .where('classification.reviewRole = :destinationRole', {
        destinationRole: ReviewLocationRole.Destination,
      })
      .orderBy('classification.name', 'ASC');
    if (query.destinationLocationId) {
      classificationsBuilder.andWhere('classification.id = :classificationId', {
        classificationId: query.destinationLocationId,
      });
    }
    if (query.destination) {
      classificationsBuilder.andWhere(
        '(classification.code ILIKE :classification OR classification.name ILIKE :classification)',
        { classification: `%${query.destination}%` },
      );
    }

    const [rawRows, rawTotals, rawClassifications] = await Promise.all([
      rowsBuilder.getRawMany<RawValues>(),
      totalsBuilder.getRawMany<RawValues>(),
      classificationsBuilder.getRawMany<RawValues>(),
    ]);
    const units = [...new Set(rawTotals.map((row) => this.string(row.unit)))];
    const classifications = new Map<string, ReviewClassificationTotal>();
    for (const row of [...rawClassifications, ...rawTotals]) {
      const id = this.string(row.destinationLocationId);
      if (!classifications.has(id)) {
        classifications.set(id, {
          destinationLocationId: id,
          destinationCode: this.string(row.destinationCode),
          destination: this.string(row.destination),
          quantityByUnit: units.map((unit) => ({ unit, quantity: 0 })),
        });
      }
    }
    for (const row of rawTotals) {
      const classification = classifications.get(this.string(row.destinationLocationId));
      const total = classification?.quantityByUnit.find(({ unit }) => unit === this.string(row.unit));
      if (total) total.quantity = this.number(row.quantity);
    }
    const byClassification = [...classifications.values()];
    const reviewed = new Map<string, number>();
    for (const total of rawTotals) {
      const unit = this.string(total.unit);
      reviewed.set(unit, (reviewed.get(unit) ?? 0) + this.number(total.quantity));
    }
    const total = rawTotals.reduce((sum, row) => sum + this.number(row.rows), 0);
    return {
      items: rawRows.map((row) => this.reviewRow(row)),
      meta: this.meta(query.page, query.limit, total),
      totals: {
        rows: total,
        reviewedQuantityByUnit: [...reviewed.entries()].map(([unit, quantity]) => ({ unit, quantity })),
        byClassification,
      },
    };
  }

  async stock(
    query: StockReportQueryDto,
    referenceDate: string,
    paginated = true,
  ): Promise<ReportResult<StockReportItem, StockReportTotals>> {
    const rowsBuilder = this.applyStockFilters(this.stockBuilder(), query, referenceDate)
      .select('position.id', 'positionId')
      .addSelect('product.id', 'productId')
      .addSelect('product.code', 'productCode')
      .addSelect('product.name', 'productName')
      .addSelect('batch.id', 'batchId')
      .addSelect('batch.code', 'batchCode')
      .addSelect('batch.manufacturingDate', 'manufacturingDate')
      .addSelect('batch.expirationDate', 'expirationDate')
      .addSelect('location.id', 'stockLocationId')
      .addSelect('location.name', 'location')
      .addSelect('position.quantity', 'quantity')
      .addSelect('product.defaultUnit', 'unit')
      .addSelect(this.expirationCase(), 'expirationStatus')
      .setParameters({
        referenceDate,
        expiringWithinDays: query.expiringWithinDays,
      })
      .orderBy('batch.expirationDate', 'ASC')
      .addOrderBy('product.name', 'ASC')
      .addOrderBy('location.name', 'ASC')
      .addOrderBy('position.id', 'ASC');
    if (paginated) {
      rowsBuilder.offset((query.page - 1) * query.limit).limit(query.limit);
    }
    const totalsBuilder = this.applyStockFilters(this.stockBuilder(), query, referenceDate)
      .select('product.defaultUnit', 'unit')
      .addSelect('COUNT(position.id)', 'positions')
      .addSelect('COALESCE(SUM(position.quantity), 0)', 'quantity')
      .groupBy('product.defaultUnit')
      .orderBy('product.defaultUnit', 'ASC');

    const [rawRows, rawTotals] = await Promise.all([
      rowsBuilder.getRawMany<RawValues>(),
      totalsBuilder.getRawMany<RawValues>(),
    ]);
    const total = rawTotals.reduce((sum, row) => sum + this.number(row.positions), 0);
    return {
      items: rawRows.map((row) => this.stockRow(row)),
      meta: this.meta(query.page, query.limit, total),
      totals: {
        positions: total,
        quantityByUnit: rawTotals.map((row) => this.quantityByUnit(row)),
      },
    };
  }

  private movementBuilder(): SelectQueryBuilder<MovementItemEntity> {
    return this.movementItems.createQueryBuilder('item')
      .innerJoin('item.movement', 'movement')
      .innerJoin('item.product', 'product')
      .innerJoin('item.batch', 'batch')
      .leftJoin('item.destinationBatch', 'destinationBatch')
      .innerJoin('movement.originLocation', 'origin')
      .leftJoin('movement.destinationLocation', 'destination')
      .innerJoin('movement.responsibleUser', 'responsible')
      .leftJoin('movement.canceledByUser', 'canceledBy');
  }

  private applyMovementFilters(
    builder: SelectQueryBuilder<MovementItemEntity>,
    query: MovementReportQueryDto,
  ): SelectQueryBuilder<MovementItemEntity> {
    if (query.dateFrom) builder.andWhere('movement.occurredAt >= :dateFrom', { dateFrom: query.dateFrom });
    if (query.dateTo) builder.andWhere('movement.occurredAt <= :dateTo', { dateTo: query.dateTo });
    if (query.type) builder.andWhere('movement.type = :type', { type: query.type });
    if (query.productId) builder.andWhere('item.productId = :productId', { productId: query.productId });
    if (query.product) builder.andWhere(`(COALESCE(item.product_snapshot->>'code', product.code) ILIKE :product OR COALESCE(item.product_snapshot->>'name', product.name) ILIKE :product)`, { product: `%${query.product}%` });
    if (query.batchId) builder.andWhere('item.batchId = :batchId', { batchId: query.batchId });
    if (query.batch) builder.andWhere('batch.code ILIKE :batch', { batch: `%${query.batch}%` });
    if (query.originLocationId) builder.andWhere('movement.originLocationId = :originLocationId', { originLocationId: query.originLocationId });
    if (query.origin) builder.andWhere('(origin.code ILIKE :origin OR origin.name ILIKE :origin)', { origin: `%${query.origin}%` });
    if (query.destinationLocationId) {
      builder.andWhere(`(
        movement.destinationLocationId = :destinationLocationId
        OR EXISTS (
          SELECT 1 FROM movement_item_distributions filtered_distribution
          WHERE filtered_distribution.movement_item_id = item.id
            AND filtered_distribution.destination_location_id = :destinationLocationId
        )
      )`, { destinationLocationId: query.destinationLocationId });
    }
    if (query.destination) {
      builder.andWhere(`(
        destination.code ILIKE :destination OR destination.name ILIKE :destination
        OR EXISTS (
          SELECT 1 FROM movement_item_distributions filtered_distribution
          INNER JOIN stock_locations filtered_location
            ON filtered_location.id = filtered_distribution.destination_location_id
          WHERE filtered_distribution.movement_item_id = item.id
            AND (filtered_location.code ILIKE :destination OR filtered_location.name ILIKE :destination)
        )
      )`, { destination: `%${query.destination}%` });
    }
    if (query.responsibleUserId) builder.andWhere('movement.responsibleUserId = :responsibleUserId', { responsibleUserId: query.responsibleUserId });
    if (query.responsible) builder.andWhere('responsible.username ILIKE :responsible', { responsible: `%${query.responsible}%` });
    if (query.status) builder.andWhere('movement.status = :status', { status: query.status });
    return builder;
  }

  private reviewBuilder(): SelectQueryBuilder<MovementItemDistributionEntity> {
    return this.distributions.createQueryBuilder('distribution')
      .innerJoin('distribution.movementItem', 'item')
      .innerJoin('item.movement', 'movement')
      .innerJoin('item.product', 'product')
      .innerJoin('item.batch', 'batch')
      .innerJoin('distribution.destinationLocation', 'destination')
      .innerJoin('movement.responsibleUser', 'responsible')
      .where('movement.type = :reviewType', { reviewType: MovementType.Review })
      .andWhere('movement.status = :effectiveStatus', { effectiveStatus: MovementStatus.Effective });
  }

  private applyReviewFilters(
    builder: SelectQueryBuilder<MovementItemDistributionEntity>,
    query: ReviewReportQueryDto,
  ): SelectQueryBuilder<MovementItemDistributionEntity> {
    if (query.dateFrom) builder.andWhere('movement.occurredAt >= :dateFrom', { dateFrom: query.dateFrom });
    if (query.dateTo) builder.andWhere('movement.occurredAt <= :dateTo', { dateTo: query.dateTo });
    if (query.productId) builder.andWhere('item.productId = :productId', { productId: query.productId });
    if (query.product) builder.andWhere(`(COALESCE(item.product_snapshot->>'code', product.code) ILIKE :product OR COALESCE(item.product_snapshot->>'name', product.name) ILIKE :product)`, { product: `%${query.product}%` });
    if (query.batchId) builder.andWhere('item.batchId = :batchId', { batchId: query.batchId });
    if (query.batch) builder.andWhere('batch.code ILIKE :batch', { batch: `%${query.batch}%` });
    if (query.destinationLocationId) builder.andWhere('distribution.destinationLocationId = :destinationLocationId', { destinationLocationId: query.destinationLocationId });
    if (query.destination) builder.andWhere('(destination.code ILIKE :destination OR destination.name ILIKE :destination)', { destination: `%${query.destination}%` });
    return builder;
  }

  private stockBuilder(): SelectQueryBuilder<StockPositionEntity> {
    return this.stockPositions.createQueryBuilder('position')
      .innerJoin('position.product', 'product')
      .innerJoin('position.batch', 'batch')
      .innerJoin('position.stockLocation', 'location')
      .where('position.quantity > 0');
  }

  private applyStockFilters(
    builder: SelectQueryBuilder<StockPositionEntity>,
    query: StockReportQueryDto,
    referenceDate: string,
  ): SelectQueryBuilder<StockPositionEntity> {
    builder.setParameters({ referenceDate, expiringWithinDays: query.expiringWithinDays });
    if (query.productId) builder.andWhere('position.productId = :productId', { productId: query.productId });
    if (query.product) builder.andWhere('(product.code ILIKE :product OR product.name ILIKE :product)', { product: `%${query.product}%` });
    if (query.batchId) builder.andWhere('position.batchId = :batchId', { batchId: query.batchId });
    if (query.batch) builder.andWhere('batch.code ILIKE :batch', { batch: `%${query.batch}%` });
    if (query.stockLocationId) builder.andWhere('position.stockLocationId = :stockLocationId', { stockLocationId: query.stockLocationId });
    if (query.location) builder.andWhere('(location.code ILIKE :location OR location.name ILIKE :location)', { location: `%${query.location}%` });
    if (query.expirationFrom) builder.andWhere('batch.expirationDate >= :expirationFrom', { expirationFrom: query.expirationFrom });
    if (query.expirationTo) builder.andWhere('batch.expirationDate <= :expirationTo', { expirationTo: query.expirationTo });
    if (query.expirationStatus === ExpirationStatus.Expired) {
      builder.andWhere('batch.expirationDate < CAST(:referenceDate AS date)');
    } else if (query.expirationStatus === ExpirationStatus.ExpiringSoon) {
      builder.andWhere('batch.expirationDate >= CAST(:referenceDate AS date)')
        .andWhere(`batch.expirationDate <= CAST(:referenceDate AS date) + (:expiringWithinDays * INTERVAL '1 day')`);
    } else if (query.expirationStatus === ExpirationStatus.Valid) {
      builder.andWhere(`batch.expirationDate > CAST(:referenceDate AS date) + (:expiringWithinDays * INTERVAL '1 day')`);
    }
    return builder;
  }

  private expirationCase(): string {
    return `CASE
      WHEN batch.expirationDate < CAST(:referenceDate AS date) THEN '${ExpirationStatus.Expired}'
      WHEN batch.expirationDate <= CAST(:referenceDate AS date) + (:expiringWithinDays * INTERVAL '1 day') THEN '${ExpirationStatus.ExpiringSoon}'
      ELSE '${ExpirationStatus.Valid}'
    END`;
  }

  private movementRow(row: RawValues): MovementReportItem {
    return {
      itemId: this.string(row.itemId), movementId: this.string(row.movementId), occurredAt: this.iso(row.occurredAt),
      type: this.string(row.type) as MovementType, status: this.string(row.status) as MovementStatus,
      responsibleUserId: this.string(row.responsibleUserId), responsible: this.string(row.responsible),
      originLocationId: this.string(row.originLocationId), origin: this.string(row.origin),
      destinationLocationId: this.nullableString(row.destinationLocationId), destination: this.string(row.destination),
      productId: this.string(row.productId), productCode: this.string(row.productCode), productName: this.string(row.productName),
      batchId: this.string(row.batchId), batchCode: this.string(row.batchCode),
      manufacturingDate: this.civilDate(row.manufacturingDate), expirationDate: this.civilDate(row.expirationDate),
      destinationManufacturingDate: row.destinationManufacturingDate ? this.civilDate(row.destinationManufacturingDate) : null,
      destinationExpirationDate: row.destinationExpirationDate ? this.civilDate(row.destinationExpirationDate) : null,
      destinationBatchId: this.nullableString(row.destinationBatchId), destinationBatchCode: this.nullableString(row.destinationBatchCode),
      quantity: this.number(row.quantity), unit: this.string(row.unit), reviewDestinations: this.string(row.reviewDestinations),
      canceledAt: row.canceledAt ? this.iso(row.canceledAt) : null,
      canceledBy: this.nullableString(row.canceledBy), cancellationReason: this.nullableString(row.cancellationReason),
    };
  }

  private reviewRow(row: RawValues): ReviewReportItem {
    return {
      distributionId: this.string(row.distributionId), movementId: this.string(row.movementId), occurredAt: this.iso(row.occurredAt),
      productId: this.string(row.productId), productCode: this.string(row.productCode), productName: this.string(row.productName),
      batchId: this.string(row.batchId), batchCode: this.string(row.batchCode),
      manufacturingDate: this.civilDate(row.manufacturingDate), expirationDate: this.civilDate(row.expirationDate),
      destinationLocationId: this.string(row.destinationLocationId), destination: this.string(row.destination),
      quantity: this.number(row.quantity), unit: this.string(row.unit), responsible: this.string(row.responsible),
    };
  }

  private stockRow(row: RawValues): StockReportItem {
    return {
      positionId: this.string(row.positionId), productId: this.string(row.productId),
      productCode: this.string(row.productCode), productName: this.string(row.productName),
      batchId: this.string(row.batchId), batchCode: this.string(row.batchCode),
      manufacturingDate: this.civilDate(row.manufacturingDate), expirationDate: this.civilDate(row.expirationDate),
      stockLocationId: this.string(row.stockLocationId), location: this.string(row.location),
      quantity: this.number(row.quantity), unit: this.string(row.unit),
      expirationStatus: this.string(row.expirationStatus) as ExpirationStatus,
    };
  }

  private quantityByUnit(row: RawValues): QuantityByUnit {
    return { unit: this.string(row.unit), quantity: this.number(row.quantity) };
  }

  private meta(page: number, limit: number, total: number): PaginationMeta {
    return { page, limit, total, totalPages: Math.ceil(total / limit) };
  }

  private number(value: string | Date | null | undefined): number {
    return Number(value ?? 0);
  }

  private string(value: string | Date | null | undefined): string {
    return value === null || value === undefined ? '' : String(value);
  }

  private nullableString(value: string | Date | null | undefined): string | null {
    return value === null || value === undefined ? null : String(value);
  }

  private civilDate(value: string | Date | null | undefined): string {
    if (!(value instanceof Date)) return this.string(value).slice(0, 10);
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private iso(value: string | Date | null | undefined): string {
    return value instanceof Date ? value.toISOString() : new Date(this.string(value)).toISOString();
  }
}
