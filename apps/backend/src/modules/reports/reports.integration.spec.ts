import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { databaseEntities, databaseMigrations } from '../../database/typeorm.config';
import { MovementStatus } from '../movements/domain/movement-status.enum';
import { MovementType } from '../movements/domain/movement-type.enum';
import { MovementItemDistributionEntity } from '../movements/entities/movement-item-distribution.entity';
import { MovementItemEntity } from '../movements/entities/movement-item.entity';
import { StockLocationEntity } from '../stocks/entities/stock-location.entity';
import { StockPositionEntity } from '../stocks/entities/stock-position.entity';
import { ExpirationStatus, StockReportQueryDto } from './dto/stock-report-query.dto';
import { MovementReportQueryDto } from './dto/movement-report-query.dto';
import { ReviewReportQueryDto } from './dto/review-report-query.dto';
import { ReportsRepository } from './reports.repository';
import { ReportsService } from './reports.service';

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('Reports (PostgreSQL)', () => {
  let dataSource: DataSource;
  let service: ReportsService;
  let userId: string;
  let productId: string;
  let expiredBatchId: string;
  let soonBatchId: string;
  let validBatchId: string;
  let productionId: string;
  let reviewId: string;
  let lataBoaId: string;
  let varejoId: string;
  let tufId: string;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres', url: databaseUrl, entities: databaseEntities, migrations: databaseMigrations,
      migrationsTableName: 'schema_migrations', dropSchema: true, migrationsRun: true,
      synchronize: false, logging: false,
    });
    await dataSource.initialize();
    service = new ReportsService(new ReportsRepository(
      dataSource.getRepository(MovementItemEntity),
      dataSource.getRepository(MovementItemDistributionEntity),
      dataSource.getRepository(StockPositionEntity),
      dataSource.getRepository(StockLocationEntity),
    ));
    userId = randomUUID();
    productId = randomUUID();
    expiredBatchId = randomUUID();
    soonBatchId = randomUUID();
    validBatchId = randomUUID();
    productionId = (await dataSource.getRepository(StockLocationEntity).findOneByOrFail({ code: 'PRODUCAO' })).id;
    reviewId = (await dataSource.getRepository(StockLocationEntity).findOneByOrFail({ code: 'REVISAR' })).id;
    lataBoaId = (await dataSource.getRepository(StockLocationEntity).findOneByOrFail({ code: 'LATA_BOA' })).id;
    varejoId = (await dataSource.getRepository(StockLocationEntity).findOneByOrFail({ code: 'VAREJO' })).id;
    tufId = (await dataSource.getRepository(StockLocationEntity).findOneByOrFail({ code: 'TUF' })).id;

    await dataSource.query(
      `INSERT INTO users (id, username, password_hash, status) VALUES ($1, 'report-user', '$argon2id$integration-placeholder', 'ACTIVE')`,
      [userId],
    );
    await dataSource.query(
      `INSERT INTO products (id, code, name, default_unit, created_by, updated_by) VALUES ($1, 'REPORT', 'Produto Relatorio', 'UN', $2, $2)`,
      [productId, userId],
    );
    await dataSource.query(`
      INSERT INTO batches (id, product_id, code, manufacturing_date, expiration_date, created_by, updated_by) VALUES
        ($1, $4, 'COCINV', '2026-09-01', '2026-09-06', $5, $5),
        ($2, $4, 'CNCINV', '2026-09-02', '2026-09-20', $5, $5),
        ($3, $4, 'CSCINV', '2026-09-03', '2027-01-01', $5, $5)
    `, [expiredBatchId, soonBatchId, validBatchId, productId, userId]);
    await seedData();
  });

  async function seedData(): Promise<void> {
    await dataSource.query(`
      INSERT INTO stock_positions (id, product_id, batch_id, stock_location_id, quantity) VALUES
        ($1, $4, $5, $7, 2), ($2, $4, $6, $7, 3), ($3, $4, $8, $7, 4),
        ($9, $4, $5, $10, 0)
    `, [
      randomUUID(), randomUUID(), randomUUID(), productId, expiredBatchId,
      soonBatchId, reviewId, validBatchId, randomUUID(), productionId,
    ]);

    const effectiveEntry = randomUUID();
    const canceledEntry = randomUUID();
    const effectiveReview = randomUUID();
    const canceledReview = randomUUID();
    await dataSource.query(`
      INSERT INTO movements (
        id, request_key, type, origin_location_id, destination_location_id, responsible_user_id,
        occurred_at, status, canceled_by_user_id, canceled_at, cancellation_reason
      ) VALUES
        ($1, $2, 'ENTRADA_EXTERNA', $9, $10, $11, '2026-09-01T12:00:00Z', 'EFETIVADA', NULL, NULL, NULL),
        ($3, $4, 'ENTRADA_EXTERNA', $9, $10, $11, '2026-09-02T12:00:00Z', 'CANCELADA', $11, '2026-09-03T12:00:00Z', 'Duplicada'),
        ($5, $6, 'REVISAO', $10, NULL, $11, '2026-09-04T12:00:00Z', 'EFETIVADA', NULL, NULL, NULL),
        ($7, $8, 'REVISAO', $10, NULL, $11, '2026-09-05T12:00:00Z', 'CANCELADA', $11, '2026-09-06T12:00:00Z', 'Classificacao incorreta')
    `, [
      effectiveEntry, randomUUID(), canceledEntry, randomUUID(), effectiveReview, randomUUID(),
      canceledReview, randomUUID(), productionId, reviewId, userId,
    ]);
    const entryItem = randomUUID();
    const canceledEntryItem = randomUUID();
    const reviewItem = randomUUID();
    const canceledReviewItem = randomUUID();
    await dataSource.query(`
      INSERT INTO movement_items (id, movement_id, product_id, batch_id, destination_batch_id, quantity) VALUES
        ($1, $5, $9, $10, NULL, 10), ($2, $6, $9, $10, NULL, 5),
        ($3, $7, $9, $10, NULL, 8), ($4, $8, $9, $10, NULL, 4)
    `, [entryItem, canceledEntryItem, reviewItem, canceledReviewItem, effectiveEntry, canceledEntry, effectiveReview, canceledReview, productId, expiredBatchId]);
    await dataSource.query(`
      INSERT INTO movement_item_distributions (id, movement_item_id, destination_location_id, quantity) VALUES
        ($1, $4, $6, 5), ($2, $4, $7, 3), ($3, $5, $8, 4)
    `, [randomUUID(), randomUUID(), randomUUID(), reviewItem, canceledReviewItem, lataBoaId, varejoId, tufId]);
  }

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('combina filtros, pagina itens e exclui canceladas dos totais validos', async () => {
    const all = await service.movements(Object.assign(new MovementReportQueryDto(), { limit: 2 }));
    expect(all.meta).toMatchObject({ total: 4, page: 1, limit: 2, totalPages: 2 });
    expect(all.totals).toMatchObject({
      rows: 4, movements: 4, effectiveMovements: 2, canceledMovements: 2,
      effectiveQuantityByUnit: [{ unit: 'UN', quantity: 18 }],
    });
    const filtered = await service.movements(Object.assign(new MovementReportQueryDto(), {
      dateFrom: '2026-09-01T00:00:00.000Z', dateTo: '2026-09-01T23:59:59.999Z',
      type: MovementType.ExternalEntry, productId, batchId: expiredBatchId,
      originLocationId: productionId, destinationLocationId: reviewId,
      product: 'Relatorio', batch: 'COC', origin: 'Producao', destination: 'Revisar',
      responsible: 'report', status: MovementStatus.Effective,
    }));
    expect(filtered.items).toHaveLength(1);
    expect(filtered.items[0]).toMatchObject({ quantity: 10, responsible: 'report-user' });
  });

  it('permite consultar canceladas sem inclui-las na quantidade valida', async () => {
    const report = await service.movements(Object.assign(new MovementReportQueryDto(), {
      status: MovementStatus.Canceled,
    }));
    expect(report.meta.total).toBe(2);
    expect(report.totals.effectiveQuantityByUnit).toEqual([]);
    expect(report.items.every((item) => item.status === MovementStatus.Canceled)).toBe(true);
  });

  it('agrega somente revisoes efetivas por classificacao e respeita destino', async () => {
    const report = await service.reviews(new ReviewReportQueryDto());
    expect(report.meta.total).toBe(2);
    expect(report.totals.reviewedQuantityByUnit).toEqual([{ unit: 'UN', quantity: 8 }]);
    expect(report.totals.byClassification).toEqual(expect.arrayContaining([
      expect.objectContaining({
        destinationCode: 'LATA_BOA', destination: 'Lata Boa',
        quantityByUnit: [{ unit: 'UN', quantity: 5 }],
      }),
      expect.objectContaining({
        destinationCode: 'VAREJO', destination: 'Varejo',
        quantityByUnit: [{ unit: 'UN', quantity: 3 }],
      }),
      expect.objectContaining({
        destinationCode: 'TUF', destination: 'TUF',
        quantityByUnit: [{ unit: 'UN', quantity: 0 }],
      }),
    ]));
    const filtered = await service.reviews(Object.assign(new ReviewReportQueryDto(), {
      productId, batchId: expiredBatchId, destinationLocationId: lataBoaId,
      product: 'REPORT', batch: 'COC', destination: 'Lata',
    }));
    expect(filtered.items).toHaveLength(1);
    expect(filtered.items[0].quantity).toBe(5);
    expect(filtered.totals.byClassification).toEqual([
      expect.objectContaining({ destinationCode: 'LATA_BOA', quantityByUnit: [{ unit: 'UN', quantity: 5 }] }),
    ]);
  });

  it('classifica validade e filtra posicoes atuais usando data civil', async () => {
    const report = await service.stock(Object.assign(new StockReportQueryDto(), {
      referenceDate: '2026-09-07', expiringWithinDays: 30,
    }));
    expect(report.meta.total).toBe(3);
    expect(report.totals).toEqual({ positions: 3, quantityByUnit: [{ unit: 'UN', quantity: 9 }] });
    expect(report.items.map((item) => item.expirationStatus)).toEqual([
      ExpirationStatus.Expired, ExpirationStatus.ExpiringSoon, ExpirationStatus.Valid,
    ]);
    const expired = await service.stock(Object.assign(new StockReportQueryDto(), {
      referenceDate: '2026-09-07', expirationStatus: ExpirationStatus.Expired,
      productId, stockLocationId: reviewId, product: 'Relatorio', batch: 'COC', location: 'Revisar',
    }));
    expect(expired.items).toHaveLength(1);
    expect(expired.items[0]).toMatchObject({
      batchId: expiredBatchId,
      manufacturingDate: '2026-09-01',
      expirationDate: '2026-09-06',
      expirationStatus: ExpirationStatus.Expired,
      quantity: 2,
    });
  });

  it('gera CSV com exatamente os dados do filtro', async () => {
    const csv = await service.reviewsCsv(Object.assign(new ReviewReportQueryDto(), {
      destinationLocationId: lataBoaId,
    }));
    expect(csv).toContain('"Lata Boa";"5";"UN"');
    expect(csv).not.toContain('"Varejo";"3";"UN"');
    expect(csv).not.toContain('"TUF";"4";"UN"');
  });
});
