import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
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
  let userId: string; let originId: string; let destinationId: string; let transferDestinationId: string; let productAId: string; let batchAId: string; let batchAEmptyId: string; let productBId: string; let batchBId: string;

  beforeAll(async () => {
    dataSource = new DataSource({ type: 'postgres', url: databaseUrl, entities: databaseEntities, migrations: databaseMigrations, migrationsTableName: 'schema_migrations', dropSchema: true, migrationsRun: true, synchronize: false, logging: false });
    await dataSource.initialize();
    const locations = new StockLocationsRepository(dataSource.getRepository(StockLocationEntity));
    stockService = new StockPositionsService(new StockPositionsRepository(dataSource.getRepository(StockPositionEntity)), new ProductsRepository(dataSource.getRepository(ProductEntity)), new BatchesRepository(dataSource.getRepository(BatchEntity)), locations);
    service = new MovementsService(new MovementsRepository(dataSource.getRepository(MovementEntity)), locations, stockService, new AuditService(new AuditRepository(dataSource.getRepository(AuditLogEntity))), dataSource);
    userId = randomUUID(); productAId = randomUUID(); batchAId = randomUUID(); batchAEmptyId = randomUUID(); productBId = randomUUID(); batchBId = randomUUID();
    await dataSource.query(`INSERT INTO users (id, username, password_hash, status) VALUES ($1, 'movement-integration', '$argon2id$integration-test-placeholder', 'ACTIVE')`, [userId]);
    await dataSource.query(`INSERT INTO products (id, code, name, default_unit, created_by, updated_by) VALUES ($1, 'MOV-A', 'Produto A', 'UN', $3, $3), ($2, 'MOV-B', 'Produto B', 'KG', $3, $3)`, [productAId, productBId, userId]);
    await dataSource.query(`INSERT INTO batches (id, product_id, code, manufacturing_date, expiration_date, created_by, updated_by) VALUES ($1, $2, 'SOCDNV', '2026-08-31', '2027-08-31', $5, $5), ($3, $4, 'SOCDNV', '2026-08-31', '2027-08-31', $5, $5)`, [batchAId, productAId, batchBId, productBId, userId]);
    await dataSource.query(`INSERT INTO batches (id, product_id, code, manufacturing_date, expiration_date, created_by, updated_by) VALUES ($1, $2, 'COCINV', '2026-09-01', '2027-09-01', $3, $3)`, [batchAEmptyId, productAId, userId]);
    originId = (await dataSource.getRepository(StockLocationEntity).findOneByOrFail({ code: 'PRODUCAO' })).id;
    destinationId = (await dataSource.getRepository(StockLocationEntity).findOneByOrFail({ code: 'REVISAR' })).id;
    transferDestinationId = (await dataSource.getRepository(StockLocationEntity).findOneByOrFail({ code: 'TUF' })).id;
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE TABLE audit_logs, movement_items, movements, stock_positions CASCADE');
  });
  afterAll(async () => { if (dataSource?.isInitialized) await dataSource.destroy(); });

  const create = (requestKey = randomUUID()): Promise<MovementEntity> => service.createExternalEntry({ requestKey, originLocationId: originId, destinationLocationId: destinationId, items: [{ productId: productAId, batchId: batchAId, quantity: 10 }, { productId: productBId, batchId: batchBId, quantity: 2.5 }] }, userId, { requestId: randomUUID(), ipAddress: null, userAgent: 'jest' });
  const seedStock = (productId: string, batchId: string, quantity: number, stockLocationId = destinationId): Promise<StockPositionEntity> => dataSource.transaction(
    (manager) => stockService.addQuantity({
      productId,
      batchId,
      stockLocationId,
    }, quantity, manager),
  );
  const createExit = (items: Array<{ productId: string; batchId: string; quantity: number }>, requestKey = randomUUID()): Promise<MovementEntity> => service.createExternalExit({
    requestKey,
    originLocationId: destinationId,
    destinationLocationId: originId,
    items,
  }, userId, { requestId: randomUUID(), ipAddress: null, userAgent: 'jest' });
  const createTransfer = (
    items: Array<{ productId: string; batchId: string; quantity: number }>,
    requestKey = randomUUID(),
    sourceId = destinationId,
    targetId = transferDestinationId,
  ): Promise<MovementEntity> => service.createInternalTransfer({
    requestKey,
    originLocationId: sourceId,
    destinationLocationId: targetId,
    items,
  }, userId, { requestId: randomUUID(), ipAddress: null, userAgent: 'jest' });

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

  it('realiza saida parcial e saida total sem criar saldo externo', async () => {
    await seedStock(productAId, batchAId, 10);
    await createExit([{ productId: productAId, batchId: batchAId, quantity: 4 }]);
    expect(await stockService.getBalance({
      productId: productAId, batchId: batchAId, stockLocationId: destinationId,
    })).toBe(6);
    await createExit([{ productId: productAId, batchId: batchAId, quantity: 6 }]);
    expect(await stockService.getBalance({
      productId: productAId, batchId: batchAId, stockLocationId: destinationId,
    })).toBe(0);
    expect(await dataSource.getRepository(StockPositionEntity).countBy({
      stockLocationId: originId,
    })).toBe(0);
  });

  it('reverte todos os itens da saida quando o ultimo possui saldo insuficiente', async () => {
    await seedStock(productAId, batchAId, 10);
    await seedStock(productBId, batchBId, 2.5);
    try {
      await createExit([
        { productId: productAId, batchId: batchAId, quantity: 4 },
        { productId: productBId, batchId: batchBId, quantity: 3 },
      ]);
      throw new Error('A saida deveria falhar por saldo insuficiente.');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toEqual({
        code: 'INSUFFICIENT_STOCK',
        message: 'Saldo insuficiente. Disponivel: 2.5.',
        available: 2.5,
      });
    }
    expect(await stockService.getBalance({
      productId: productAId, batchId: batchAId, stockLocationId: destinationId,
    })).toBe(10);
    expect(await stockService.getBalance({
      productId: productBId, batchId: batchBId, stockLocationId: destinationId,
    })).toBe(2.5);
    expect(await dataSource.getRepository(MovementEntity).count()).toBe(0);
    expect(await dataSource.getRepository(AuditLogEntity).count()).toBe(0);
  });

  it('permite somente uma de duas saidas concorrentes sobre o mesmo saldo', async () => {
    await seedStock(productAId, batchAId, 10);
    const results = await Promise.allSettled([
      createExit([{ productId: productAId, batchId: batchAId, quantity: 7 }]),
      createExit([{ productId: productAId, batchId: batchAId, quantity: 7 }]),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await stockService.getBalance({
      productId: productAId, batchId: batchAId, stockLocationId: destinationId,
    })).toBe(3);
    expect(await dataSource.getRepository(MovementEntity).count()).toBe(1);
  });

  it('registra saida no mesmo historico, detalhe, responsavel e auditoria', async () => {
    await seedStock(productAId, batchAId, 8);
    const requestKey = randomUUID();
    const created = await createExit([
      { productId: productAId, batchId: batchAId, quantity: 3 },
    ], requestKey);
    const repeated = await createExit([
      { productId: productAId, batchId: batchAId, quantity: 3 },
    ], requestKey);
    expect(repeated.id).toBe(created.id);
    const history = await service.list({
      page: 1,
      limit: 20,
      type: MovementType.ExternalExit,
      originLocationId: destinationId,
      destinationLocationId: originId,
      productId: productAId,
    });
    expect(history.meta.total).toBe(1);
    const detail = await service.getById(created.id);
    expect(detail).toMatchObject({
      type: MovementType.ExternalExit,
      responsibleUserId: userId,
      items: [expect.objectContaining({ quantity: 3 })],
    });
    expect(await dataSource.getRepository(AuditLogEntity).countBy({
      entityId: created.id,
      action: 'EXTERNAL_EXIT_CREATE',
    })).toBe(1);
  });

  it('realiza transferencia parcial, cria o destino e preserva a quantidade total', async () => {
    await seedStock(productAId, batchAId, 10);
    const created = await createTransfer([
      { productId: productAId, batchId: batchAId, quantity: 4 },
    ]);
    const sourceBalance = await stockService.getBalance({
      productId: productAId, batchId: batchAId, stockLocationId: destinationId,
    });
    const targetBalance = await stockService.getBalance({
      productId: productAId, batchId: batchAId, stockLocationId: transferDestinationId,
    });
    expect(sourceBalance).toBe(6);
    expect(targetBalance).toBe(4);
    expect(sourceBalance + targetBalance).toBe(10);
    expect(created.type).toBe(MovementType.InternalTransfer);
  });

  it('transfere varios itens e soma em uma posicao ja existente no destino', async () => {
    await seedStock(productAId, batchAId, 10);
    await seedStock(productBId, batchBId, 5);
    await seedStock(productAId, batchAId, 2, transferDestinationId);
    const created = await createTransfer([
      { productId: productBId, batchId: batchBId, quantity: 1.5 },
      { productId: productAId, batchId: batchAId, quantity: 4 },
    ]);
    expect(created.items).toHaveLength(2);
    expect(await stockService.getBalance({
      productId: productAId, batchId: batchAId, stockLocationId: transferDestinationId,
    })).toBe(6);
    expect(await stockService.getBalance({
      productId: productBId, batchId: batchBId, stockLocationId: transferDestinationId,
    })).toBe(1.5);
  });

  it('permite transferencia total e mantem a posicao de origem zerada', async () => {
    await seedStock(productAId, batchAId, 7);
    await createTransfer([{ productId: productAId, batchId: batchAId, quantity: 7 }]);
    expect(await stockService.getBalance({
      productId: productAId, batchId: batchAId, stockLocationId: destinationId,
    })).toBe(0);
    expect(await stockService.getBalance({
      productId: productAId, batchId: batchAId, stockLocationId: transferDestinationId,
    })).toBe(7);
  });

  it('rejeita locais iguais, origem externa e destino externo', async () => {
    const item = [{ productId: productAId, batchId: batchAId, quantity: 1 }];
    await expect(createTransfer(item, randomUUID(), destinationId, destinationId))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(createTransfer(item, randomUUID(), originId, transferDestinationId))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(createTransfer(item, randomUUID(), destinationId, originId))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(await dataSource.getRepository(MovementEntity).count()).toBe(0);
  });

  it.each([0, -1])('rejeita quantidade invalida na transferencia: %s', async (quantity) => {
    await seedStock(productAId, batchAId, 10);
    await expect(createTransfer([{ productId: productAId, batchId: batchAId, quantity }]))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(await stockService.getBalance({
      productId: productAId, batchId: batchAId, stockLocationId: destinationId,
    })).toBe(10);
  });

  it('rejeita produto sem saldo, lote sem saldo e lote pertencente a outro produto', async () => {
    await expect(createTransfer([
      { productId: productBId, batchId: batchBId, quantity: 1 },
    ])).rejects.toBeInstanceOf(ConflictException);
    await seedStock(productAId, batchAId, 10);
    await expect(createTransfer([
      { productId: productAId, batchId: batchAEmptyId, quantity: 1 },
    ])).rejects.toBeInstanceOf(ConflictException);
    await expect(createTransfer([
      { productId: productAId, batchId: batchBId, quantity: 1 },
    ])).rejects.toBeInstanceOf(BadRequestException);
    expect(await stockService.getBalance({
      productId: productAId, batchId: batchAId, stockLocationId: destinationId,
    })).toBe(10);
  });

  it('reverte toda a transferencia quando o ultimo item nao possui saldo', async () => {
    await seedStock(productAId, batchAId, 10);
    await seedStock(productBId, batchBId, 2);
    await expect(createTransfer([
      { productId: productAId, batchId: batchAId, quantity: 4 },
      { productId: productBId, batchId: batchBId, quantity: 3 },
    ])).rejects.toBeInstanceOf(ConflictException);
    expect(await stockService.getBalance({
      productId: productAId, batchId: batchAId, stockLocationId: destinationId,
    })).toBe(10);
    expect(await stockService.getBalance({
      productId: productAId, batchId: batchAId, stockLocationId: transferDestinationId,
    })).toBe(0);
    expect(await dataSource.getRepository(MovementEntity).count()).toBe(0);
    expect(await dataSource.getRepository(AuditLogEntity).count()).toBe(0);
  });

  it('permite somente uma transferencia concorrente sobre o mesmo saldo', async () => {
    await seedStock(productAId, batchAId, 10);
    const results = await Promise.allSettled([
      createTransfer([{ productId: productAId, batchId: batchAId, quantity: 7 }]),
      createTransfer([{ productId: productAId, batchId: batchAId, quantity: 7 }]),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await stockService.getBalance({
      productId: productAId, batchId: batchAId, stockLocationId: destinationId,
    })).toBe(3);
    expect(await stockService.getBalance({
      productId: productAId, batchId: batchAId, stockLocationId: transferDestinationId,
    })).toBe(7);
  });

  it('serializa transferencias simultaneas em sentidos opostos', async () => {
    await seedStock(productAId, batchAId, 10);
    await seedStock(productAId, batchAId, 10, transferDestinationId);
    const results = await Promise.allSettled([
      createTransfer([{ productId: productAId, batchId: batchAId, quantity: 5 }]),
      createTransfer([
        { productId: productAId, batchId: batchAId, quantity: 4 },
      ], randomUUID(), transferDestinationId, destinationId),
    ]);
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    expect(await stockService.getBalance({
      productId: productAId, batchId: batchAId, stockLocationId: destinationId,
    })).toBe(9);
    expect(await stockService.getBalance({
      productId: productAId, batchId: batchAId, stockLocationId: transferDestinationId,
    })).toBe(11);
  });

  it('registra historico, responsavel, auditoria e idempotencia da transferencia', async () => {
    await seedStock(productAId, batchAId, 8);
    const requestKey = randomUUID();
    const item = [{ productId: productAId, batchId: batchAId, quantity: 3 }];
    const created = await createTransfer(item, requestKey);
    const repeated = await createTransfer(item, requestKey);
    expect(repeated.id).toBe(created.id);
    const history = await service.list({
      page: 1,
      limit: 20,
      type: MovementType.InternalTransfer,
      originLocationId: destinationId,
      destinationLocationId: transferDestinationId,
      productId: productAId,
    });
    expect(history.meta.total).toBe(1);
    expect(await service.getById(created.id)).toMatchObject({
      type: MovementType.InternalTransfer,
      responsibleUserId: userId,
      items: [expect.objectContaining({ quantity: 3 })],
    });
    expect(await dataSource.getRepository(AuditLogEntity).countBy({
      entityId: created.id,
      action: 'INTERNAL_TRANSFER_CREATE',
    })).toBe(1);
    await expect(dataSource.getRepository(MovementEntity).delete(created.id))
      .rejects.toMatchObject({ code: '23503' });
  });
});
