import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { databaseEntities, databaseMigrations } from '../../database/typeorm.config';
import { AuditRepository } from '../audit/audit.repository';
import { AuditService } from '../audit/audit.service';
import { AuditLogEntity } from '../audit/entities/audit-log.entity';
import { BatchEntity } from '../batches/entities/batch.entity';
import { BatchesRepository } from '../batches/batches.repository';
import { ProductEntity } from '../products/entities/product.entity';
import { ProductsRepository } from '../products/products.repository';
import { StockLocationEntity } from '../stocks/entities/stock-location.entity';
import { StockPositionEntity } from '../stocks/entities/stock-position.entity';
import { StockLocationsRepository } from '../stocks/stock-locations.repository';
import { StockPositionsRepository } from '../stocks/stock-positions.repository';
import { StockPositionsService } from '../stocks/stock-positions.service';
import { MovementType } from './domain/movement-type.enum';
import { MovementItemEntity } from './entities/movement-item.entity';
import { MovementEntity } from './entities/movement.entity';
import { MovementsRepository } from './movements.repository';
import { MovementsService } from './movements.service';

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('MovementsService (PostgreSQL)', () => {
  let dataSource: DataSource; let service: MovementsService; let stockService: StockPositionsService;
  let userId: string; let originId: string; let destinationId: string; let productAId: string; let batchAId: string; let productBId: string; let batchBId: string;

  beforeAll(async () => {
    dataSource = new DataSource({ type: 'postgres', url: databaseUrl, entities: databaseEntities, migrations: databaseMigrations, migrationsTableName: 'schema_migrations', dropSchema: true, migrationsRun: true, synchronize: false, logging: false });
    await dataSource.initialize();
    const locations = new StockLocationsRepository(dataSource.getRepository(StockLocationEntity));
    stockService = new StockPositionsService(new StockPositionsRepository(dataSource.getRepository(StockPositionEntity)), new ProductsRepository(dataSource.getRepository(ProductEntity)), new BatchesRepository(dataSource.getRepository(BatchEntity)), locations);
    service = new MovementsService(new MovementsRepository(dataSource.getRepository(MovementEntity)), locations, stockService, new AuditService(new AuditRepository(dataSource.getRepository(AuditLogEntity))), dataSource);
    userId = randomUUID(); productAId = randomUUID(); batchAId = randomUUID(); productBId = randomUUID(); batchBId = randomUUID();
    await dataSource.query(`INSERT INTO users (id, username, password_hash, status) VALUES ($1, 'movement-integration', '$argon2id$integration-test-placeholder', 'ACTIVE')`, [userId]);
    await dataSource.query(`INSERT INTO products (id, code, name, default_unit, created_by, updated_by) VALUES ($1, 'MOV-A', 'Produto A', 'UN', $3, $3), ($2, 'MOV-B', 'Produto B', 'KG', $3, $3)`, [productAId, productBId, userId]);
    await dataSource.query(`INSERT INTO batches (id, product_id, code, manufacturing_date, expiration_date, created_by, updated_by) VALUES ($1, $2, 'SOCDNV', '2026-08-31', '2027-08-31', $5, $5), ($3, $4, 'SOCDNV', '2026-08-31', '2027-08-31', $5, $5)`, [batchAId, productAId, batchBId, productBId, userId]);
    originId = (await dataSource.getRepository(StockLocationEntity).findOneByOrFail({ code: 'PRODUCAO' })).id;
    destinationId = (await dataSource.getRepository(StockLocationEntity).findOneByOrFail({ code: 'REVISAR' })).id;
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE TABLE audit_logs, movement_items, movements, stock_positions CASCADE');
  });
  afterAll(async () => { if (dataSource?.isInitialized) await dataSource.destroy(); });

  const create = (requestKey = randomUUID()) => service.createExternalEntry({ requestKey, originLocationId: originId, destinationLocationId: destinationId, items: [{ productId: productAId, batchId: batchAId, quantity: 10 }, { productId: productBId, batchId: batchBId, quantity: 2.5 }] }, userId, { requestId: randomUUID(), ipAddress: null, userAgent: 'jest' });

  it('efetiva varios itens, cria posicoes e auditoria atomicamente', async () => {
    const movement = await create();
    expect(movement.items).toHaveLength(2);
    expect(await stockService.getBalance({ productId: productAId, batchId: batchAId, stockLocationId: destinationId })).toBe(10);
    expect(await stockService.getBalance({ productId: productBId, batchId: batchBId, stockLocationId: destinationId })).toBe(2.5);
    expect(await dataSource.getRepository(AuditLogEntity).countBy({ entityId: movement.id })).toBe(1);
  });

  it('acumula em posicao existente e nao cria saldo na origem externa', async () => {
    await create(); await create();
    expect(await stockService.getBalance({ productId: productAId, batchId: batchAId, stockLocationId: destinationId })).toBe(20);
    expect(await dataSource.getRepository(StockPositionEntity).countBy({ stockLocationId: originId })).toBe(0);
  });

  it('reverte cabecalho, primeiro item e saldo quando um item posterior falha', async () => {
    await expect(service.createExternalEntry({ requestKey: randomUUID(), originLocationId: originId, destinationLocationId: destinationId, items: [{ productId: productAId, batchId: batchAId, quantity: 4 }, { productId: productAId, batchId: batchBId, quantity: 1 }] }, userId, { requestId: randomUUID(), ipAddress: null, userAgent: null })).rejects.toBeInstanceOf(BadRequestException);
    expect(await dataSource.getRepository(MovementEntity).count()).toBe(0);
    expect(await dataSource.getRepository(MovementItemEntity).count()).toBe(0);
    expect(await dataSource.getRepository(StockPositionEntity).count()).toBe(0);
    expect(await dataSource.getRepository(AuditLogEntity).count()).toBe(0);
  });

  it('mantem idempotencia, detalhe imutavel e filtros combinados', async () => {
    const requestKey = randomUUID(); const first = await create(requestKey); const repeated = await create(requestKey);
    expect(repeated.id).toBe(first.id);
    expect(await dataSource.getRepository(MovementEntity).count()).toBe(1);
    const history = await service.list({ page: 1, limit: 20, type: MovementType.ExternalEntry, originLocationId: originId, destinationLocationId: destinationId, productId: productAId });
    expect(history.meta.total).toBe(1);
    expect((await service.getById(first.id)).items).toHaveLength(2);
    await expect(dataSource.getRepository(MovementEntity).delete(first.id)).rejects.toMatchObject({ code: '23503' });
  });
});
