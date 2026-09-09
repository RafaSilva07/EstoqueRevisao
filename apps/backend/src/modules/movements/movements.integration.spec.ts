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
import { MovementStatus } from './domain/movement-status.enum';
import { MovementItemEntity } from './entities/movement-item.entity';
import { MovementItemDistributionEntity } from './entities/movement-item-distribution.entity';
import { MovementEntity } from './entities/movement.entity';
import { MovementsRepository } from './movements.repository';
import { MovementsService } from './movements.service';

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('MovementsService (PostgreSQL)', () => {
  let dataSource: DataSource; let service: MovementsService; let stockService: StockPositionsService;
  let userId: string; let originId: string; let destinationId: string; let transferDestinationId: string; let lataBoaId: string; let varejoId: string; let productAId: string; let batchAId: string; let batchAEmptyId: string; let productBId: string; let batchBId: string;

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
    lataBoaId = (await dataSource.getRepository(StockLocationEntity).findOneByOrFail({ code: 'LATA_BOA' })).id;
    varejoId = (await dataSource.getRepository(StockLocationEntity).findOneByOrFail({ code: 'VAREJO' })).id;
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
    items: Array<{
      productId: string;
      batchId: string;
      destinationBatchId?: string;
      quantity: number;
    }>,
    requestKey = randomUUID(),
    sourceId = destinationId,
    targetId = transferDestinationId,
  ): Promise<MovementEntity> => service.createInternalTransfer({
    requestKey,
    originLocationId: sourceId,
    destinationLocationId: targetId,
    items: items.map((item) => ({
      ...item,
      destinationBatchId: item.destinationBatchId ?? item.batchId,
    })),
  }, userId, { requestId: randomUUID(), ipAddress: null, userAgent: 'jest' });
  const createReview = (
    items: Array<{
      productId: string;
      batchId: string;
      quantity: number;
      distributions: Array<{ destinationLocationId: string; quantity: number }>;
    }>,
    requestKey = randomUUID(),
  ): Promise<MovementEntity> => service.createReview({ requestKey, items }, userId, {
    requestId: randomUUID(), ipAddress: null, userAgent: 'jest',
  });

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

  it('transfere para outro lote do mesmo produto e preserva o total do produto', async () => {
    await seedStock(productAId, batchAId, 10);
    const totalBefore = await dataSource.getRepository(StockPositionEntity)
      .createQueryBuilder('position')
      .select('COALESCE(SUM(position.quantity), 0)', 'total')
      .where('position.productId = :productAId', { productAId })
      .getRawOne<{ total: string }>();
    const created = await createTransfer([{
      productId: productAId,
      batchId: batchAId,
      destinationBatchId: batchAEmptyId,
      quantity: 4,
    }]);
    expect(await stockService.getBalance({
      productId: productAId, batchId: batchAId, stockLocationId: destinationId,
    })).toBe(6);
    expect(await stockService.getBalance({
      productId: productAId, batchId: batchAEmptyId, stockLocationId: transferDestinationId,
    })).toBe(4);
    const totalAfter = await dataSource.getRepository(StockPositionEntity)
      .createQueryBuilder('position')
      .select('COALESCE(SUM(position.quantity), 0)', 'total')
      .where('position.productId = :productAId', { productAId })
      .getRawOne<{ total: string }>();
    expect(totalAfter?.total).toBe(totalBefore?.total);
    expect((await service.getById(created.id)).items[0]).toMatchObject({
      batchId: batchAId,
      destinationBatchId: batchAEmptyId,
      destinationBatch: { id: batchAEmptyId, code: 'COCINV' },
    });
  });

  it('troca o lote dentro do mesmo local e soma em posicao existente', async () => {
    await seedStock(productAId, batchAId, 10);
    await seedStock(productAId, batchAEmptyId, 2);
    const created = await createTransfer([{
      productId: productAId,
      batchId: batchAId,
      destinationBatchId: batchAEmptyId,
      quantity: 4,
    }], randomUUID(), destinationId, destinationId);
    expect(created.originLocationId).toBe(created.destinationLocationId);
    expect(await stockService.getBalance({
      productId: productAId, batchId: batchAId, stockLocationId: destinationId,
    })).toBe(6);
    expect(await stockService.getBalance({
      productId: productAId, batchId: batchAEmptyId, stockLocationId: destinationId,
    })).toBe(6);
  });

  it('rejeita mesmo local com mesmo lote e lote de destino de outro produto', async () => {
    await seedStock(productAId, batchAId, 10);
    await expect(createTransfer([{
      productId: productAId, batchId: batchAId, quantity: 1,
    }], randomUUID(), destinationId, destinationId)).rejects.toMatchObject({
      response: { code: 'TRANSFER_WITHOUT_CHANGE' },
    });
    await expect(createTransfer([{
      productId: productAId,
      batchId: batchAId,
      destinationBatchId: batchBId,
      quantity: 1,
    }])).rejects.toBeInstanceOf(BadRequestException);
    expect(await stockService.getBalance({
      productId: productAId, batchId: batchAId, stockLocationId: destinationId,
    })).toBe(10);
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

  it('realiza revisao parcial para um, dois e tres destinos preservando o total', async () => {
    await seedStock(productAId, batchAId, 30);
    await createReview([{
      productId: productAId,
      batchId: batchAId,
      quantity: 6,
      distributions: [{ destinationLocationId: lataBoaId, quantity: 6 }],
    }]);
    await createReview([{
      productId: productAId,
      batchId: batchAId,
      quantity: 9,
      distributions: [
        { destinationLocationId: lataBoaId, quantity: 5 },
        { destinationLocationId: varejoId, quantity: 4 },
      ],
    }]);
    await createReview([{
      productId: productAId,
      batchId: batchAId,
      quantity: 10,
      distributions: [
        { destinationLocationId: lataBoaId, quantity: 5 },
        { destinationLocationId: varejoId, quantity: 3 },
        { destinationLocationId: transferDestinationId, quantity: 2 },
      ],
    }]);
    const balances = await Promise.all([destinationId, lataBoaId, varejoId, transferDestinationId]
      .map((stockLocationId) => stockService.getBalance({
        productId: productAId, batchId: batchAId, stockLocationId,
      })));
    expect(balances).toEqual([5, 16, 7, 2]);
    expect(balances.reduce((total, value) => total + value, 0)).toBe(30);
  });

  it('distribui 600 de 1000 entre Lata Boa, Varejo e TUF em uma unica revisao', async () => {
    await seedStock(productAId, batchAId, 1000);

    const movement = await createReview([{
      productId: productAId,
      batchId: batchAId,
      quantity: 600,
      distributions: [
        { destinationLocationId: lataBoaId, quantity: 300 },
        { destinationLocationId: varejoId, quantity: 200 },
        { destinationLocationId: transferDestinationId, quantity: 100 },
      ],
    }]);

    const balances = await Promise.all([
      destinationId,
      lataBoaId,
      varejoId,
      transferDestinationId,
    ].map((stockLocationId) => stockService.getBalance({
      productId: productAId,
      batchId: batchAId,
      stockLocationId,
    })));
    expect(balances).toEqual([400, 300, 200, 100]);

    const detail = await service.getById(movement.id);
    expect(detail.items).toHaveLength(1);
    expect(detail.items[0]).toMatchObject({
      productId: productAId,
      batchId: batchAId,
      quantity: 600,
    });
    expect(detail.items[0].distributions).toEqual(expect.arrayContaining([
      expect.objectContaining({ destinationLocationId: lataBoaId, quantity: 300 }),
      expect.objectContaining({ destinationLocationId: varejoId, quantity: 200 }),
      expect.objectContaining({ destinationLocationId: transferDestinationId, quantity: 100 }),
    ]));
  });

  it('realiza revisao completa com varios produtos e preserva lote, fabricacao e validade', async () => {
    await seedStock(productAId, batchAId, 10);
    await seedStock(productBId, batchBId, 5);
    const movement = await createReview([
      {
        productId: productBId,
        batchId: batchBId,
        quantity: 5,
        distributions: [
          { destinationLocationId: lataBoaId, quantity: 3 },
          { destinationLocationId: transferDestinationId, quantity: 2 },
        ],
      },
      {
        productId: productAId,
        batchId: batchAId,
        quantity: 10,
        distributions: [
          { destinationLocationId: lataBoaId, quantity: 7 },
          { destinationLocationId: varejoId, quantity: 3 },
        ],
      },
    ]);
    const detail = await service.getById(movement.id);
    expect(detail).toMatchObject({
      type: MovementType.Review,
      destinationLocationId: null,
      responsibleUserId: userId,
    });
    expect(detail.items).toHaveLength(2);
    expect(detail.items.flatMap((item) => item.distributions)).toHaveLength(4);
    const itemA = detail.items.find((item) => item.productId === productAId);
    expect(itemA).toMatchObject({
      batchId: batchAId,
      destinationBatchId: null,
      batch: {
        code: 'SOCDNV',
        manufacturingDate: '2026-08-31',
        expirationDate: '2027-08-31',
      },
    });
    expect(await stockService.getBalance({
      productId: productAId, batchId: batchAId, stockLocationId: destinationId,
    })).toBe(0);
    expect(await dataSource.getRepository(AuditLogEntity).countBy({
      entityId: movement.id,
      action: 'REVIEW_CREATE',
    })).toBe(1);
  });

  it('rejeita distribuicao incompleta, excedente, destino Revisar e local externo', async () => {
    await seedStock(productAId, batchAId, 10);
    for (const distributions of [
      [{ destinationLocationId: lataBoaId, quantity: 9 }],
      [{ destinationLocationId: lataBoaId, quantity: 11 }],
      [{ destinationLocationId: destinationId, quantity: 10 }],
      [{ destinationLocationId: originId, quantity: 10 }],
    ]) {
      await expect(createReview([{
        productId: productAId, batchId: batchAId, quantity: 10, distributions,
      }])).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(await stockService.getBalance({
      productId: productAId, batchId: batchAId, stockLocationId: destinationId,
    })).toBe(10);
    expect(await dataSource.getRepository(MovementEntity).count()).toBe(0);
  });

  it.each([0, -1])('rejeita quantidade revisada invalida: %s', async (quantity) => {
    await seedStock(productAId, batchAId, 10);
    await expect(createReview([{
      productId: productAId,
      batchId: batchAId,
      quantity,
      distributions: [{ destinationLocationId: lataBoaId, quantity }],
    }])).rejects.toBeInstanceOf(BadRequestException);
    expect(await stockService.getBalance({
      productId: productAId, batchId: batchAId, stockLocationId: destinationId,
    })).toBe(10);
  });

  it('rejeita saldo insuficiente, lote sem saldo e lote pertencente a outro produto', async () => {
    await seedStock(productAId, batchAId, 5);
    await expect(createReview([{
      productId: productAId,
      batchId: batchAId,
      quantity: 6,
      distributions: [{ destinationLocationId: lataBoaId, quantity: 6 }],
    }])).rejects.toBeInstanceOf(ConflictException);
    await expect(createReview([{
      productId: productAId,
      batchId: batchAEmptyId,
      quantity: 1,
      distributions: [{ destinationLocationId: lataBoaId, quantity: 1 }],
    }])).rejects.toBeInstanceOf(ConflictException);
    await expect(createReview([{
      productId: productAId,
      batchId: batchBId,
      quantity: 1,
      distributions: [{ destinationLocationId: lataBoaId, quantity: 1 }],
    }])).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reverte integralmente varios itens quando o ultimo falha', async () => {
    await seedStock(productAId, batchAId, 10);
    await seedStock(productBId, batchBId, 2);
    await expect(createReview([
      {
        productId: productAId,
        batchId: batchAId,
        quantity: 4,
        distributions: [{ destinationLocationId: lataBoaId, quantity: 4 }],
      },
      {
        productId: productBId,
        batchId: batchBId,
        quantity: 3,
        distributions: [{ destinationLocationId: varejoId, quantity: 3 }],
      },
    ])).rejects.toBeInstanceOf(ConflictException);
    expect(await stockService.getBalance({
      productId: productAId, batchId: batchAId, stockLocationId: destinationId,
    })).toBe(10);
    expect(await stockService.getBalance({
      productId: productAId, batchId: batchAId, stockLocationId: lataBoaId,
    })).toBe(0);
    expect(await dataSource.getRepository(MovementEntity).count()).toBe(0);
    expect(await dataSource.getRepository(MovementItemDistributionEntity).count()).toBe(0);
    expect(await dataSource.getRepository(AuditLogEntity).count()).toBe(0);
  });

  it('permite somente uma revisao concorrente sobre o mesmo saldo', async () => {
    await seedStock(productAId, batchAId, 10);
    const item = [{
      productId: productAId,
      batchId: batchAId,
      quantity: 7,
      distributions: [{ destinationLocationId: lataBoaId, quantity: 7 }],
    }];
    const results = await Promise.allSettled([createReview(item), createReview(item)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await stockService.getBalance({
      productId: productAId, batchId: batchAId, stockLocationId: destinationId,
    })).toBe(3);
    expect(await stockService.getBalance({
      productId: productAId, batchId: batchAId, stockLocationId: lataBoaId,
    })).toBe(7);
  });

  it('mantem revisao no historico geral, detalhe imutavel e idempotencia', async () => {
    await seedStock(productAId, batchAId, 8);
    const requestKey = randomUUID();
    const item = [{
      productId: productAId,
      batchId: batchAId,
      quantity: 3,
      distributions: [
        { destinationLocationId: lataBoaId, quantity: 2 },
        { destinationLocationId: varejoId, quantity: 1 },
      ],
    }];
    const created = await createReview(item, requestKey);
    expect((await createReview(item, requestKey)).id).toBe(created.id);
    const history = await service.list({
      page: 1,
      limit: 20,
      type: MovementType.Review,
      originLocationId: destinationId,
      destinationLocationId: varejoId,
      productId: productAId,
    });
    expect(history.meta.total).toBe(1);
    expect(history.items[0].items[0].distributions).toEqual(expect.arrayContaining([
      expect.objectContaining({ destinationLocationId: lataBoaId, quantity: 2 }),
      expect.objectContaining({ destinationLocationId: varejoId, quantity: 1 }),
    ]));
    expect(await dataSource.getRepository(MovementEntity).count()).toBe(1);
    await expect(dataSource.getRepository(MovementEntity).delete(created.id))
      .rejects.toMatchObject({ code: '23503' });
  });

  describe('cancelamento e estorno', () => {
    const cancel = (movementId: string): Promise<MovementEntity> => service.cancel(
      movementId,
      { reason: 'Lancamento operacional incorreto' },
      userId,
      { requestId: randomUUID(), ipAddress: null, userAgent: 'jest' },
    );

    it('estorna entrada, preserva o original e registra metadados e auditoria', async () => {
      const created = await create();
      const canceled = await cancel(created.id);
      expect(canceled).toMatchObject({
        id: created.id,
        status: MovementStatus.Canceled,
        canceledByUserId: userId,
        cancellationReason: 'Lancamento operacional incorreto',
      });
      expect(canceled.canceledAt).toBeInstanceOf(Date);
      expect(canceled.canceledByUser?.username).toBe('movement-integration');
      expect(await stockService.getBalance({
        productId: productAId, batchId: batchAId, stockLocationId: destinationId,
      })).toBe(0);
      expect(await stockService.getBalance({
        productId: productBId, batchId: batchBId, stockLocationId: destinationId,
      })).toBe(0);
      expect(await dataSource.getRepository(MovementEntity).count()).toBe(1);
      expect(await dataSource.getRepository(AuditLogEntity).countBy({
        entityId: created.id,
        action: 'MOVEMENT_CANCEL',
      })).toBe(1);
    });

    it('estorna saida externa devolvendo integralmente o saldo a origem', async () => {
      await seedStock(productAId, batchAId, 10);
      const created = await createExit([{ productId: productAId, batchId: batchAId, quantity: 4 }]);
      await cancel(created.id);
      expect(await stockService.getBalance({
        productId: productAId, batchId: batchAId, stockLocationId: destinationId,
      })).toBe(10);
    });

    it('estorna transferencia com troca de lote no mesmo local', async () => {
      await seedStock(productAId, batchAId, 10);
      const created = await createTransfer([{
        productId: productAId,
        batchId: batchAId,
        destinationBatchId: batchAEmptyId,
        quantity: 4,
      }], randomUUID(), destinationId, destinationId);
      await cancel(created.id);
      expect(await stockService.getBalance({
        productId: productAId, batchId: batchAId, stockLocationId: destinationId,
      })).toBe(10);
      expect(await stockService.getBalance({
        productId: productAId, batchId: batchAEmptyId, stockLocationId: destinationId,
      })).toBe(0);
    });

    it('estorna revisao com multiplos destinos e devolve ao Revisar', async () => {
      await seedStock(productAId, batchAId, 10);
      const created = await createReview([{
        productId: productAId,
        batchId: batchAId,
        quantity: 10,
        distributions: [
          { destinationLocationId: lataBoaId, quantity: 6 },
          { destinationLocationId: varejoId, quantity: 4 },
        ],
      }]);
      await cancel(created.id);
      expect(await stockService.getBalance({
        productId: productAId, batchId: batchAId, stockLocationId: destinationId,
      })).toBe(10);
      expect(await stockService.getBalance({
        productId: productAId, batchId: batchAId, stockLocationId: lataBoaId,
      })).toBe(0);
      expect(await stockService.getBalance({
        productId: productAId, batchId: batchAId, stockLocationId: varejoId,
      })).toBe(0);
    });

    it('bloqueia estorno com saldo consumido e faz rollback integral', async () => {
      const entry = await create();
      await createExit([{ productId: productBId, batchId: batchBId, quantity: 2.5 }]);
      await expect(cancel(entry.id)).rejects.toBeInstanceOf(ConflictException);
      expect((await service.getById(entry.id)).status).toBe(MovementStatus.Effective);
      expect(await stockService.getBalance({
        productId: productAId, batchId: batchAId, stockLocationId: destinationId,
      })).toBe(10);
      expect(await stockService.getBalance({
        productId: productBId, batchId: batchBId, stockLocationId: destinationId,
      })).toBe(0);
      expect(await dataSource.getRepository(AuditLogEntity).countBy({
        entityId: entry.id,
        action: 'MOVEMENT_CANCEL',
      })).toBe(0);
    });

    it('permite somente um de dois cancelamentos concorrentes', async () => {
      const entry = await create();
      const results = await Promise.allSettled([cancel(entry.id), cancel(entry.id)]);
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
      expect(await stockService.getBalance({
        productId: productAId, batchId: batchAId, stockLocationId: destinationId,
      })).toBe(0);
      await expect(cancel(entry.id)).rejects.toMatchObject({
        response: { code: 'MOVEMENT_ALREADY_CANCELED' },
      });
    });

    it('preserva saldos e historico no ciclo completo com estornos em ordem reversa', async () => {
      const entry = await create();
      const review = await createReview([{
        productId: productAId,
        batchId: batchAId,
        quantity: 6,
        distributions: [
          { destinationLocationId: lataBoaId, quantity: 3 },
          { destinationLocationId: varejoId, quantity: 2 },
          { destinationLocationId: transferDestinationId, quantity: 1 },
        ],
      }]);
      const transfer = await createTransfer([{
        productId: productAId,
        batchId: batchAId,
        destinationBatchId: batchAEmptyId,
        quantity: 2,
      }]);
      const exit = await service.createExternalExit({
        requestKey: randomUUID(),
        originLocationId: transferDestinationId,
        destinationLocationId: originId,
        items: [{ productId: productAId, batchId: batchAId, quantity: 1 }],
      }, userId, { requestId: randomUUID(), ipAddress: null, userAgent: 'jest' });

      expect(await Promise.all([
        [batchAId, destinationId],
        [batchAId, lataBoaId],
        [batchAId, varejoId],
        [batchAId, transferDestinationId],
        [batchAEmptyId, transferDestinationId],
      ].map(([batchId, stockLocationId]) => stockService.getBalance({
        productId: productAId,
        batchId,
        stockLocationId,
      })))).toEqual([2, 3, 2, 0, 2]);

      await cancel(exit.id);
      await cancel(transfer.id);
      await cancel(review.id);
      await cancel(entry.id);

      expect(await Promise.all([
        [batchAId, destinationId],
        [batchBId, destinationId],
        [batchAId, lataBoaId],
        [batchAId, varejoId],
        [batchAId, transferDestinationId],
        [batchAEmptyId, transferDestinationId],
      ].map(([batchId, stockLocationId], index) => stockService.getBalance({
        productId: index === 1 ? productBId : productAId,
        batchId,
        stockLocationId,
      })))).toEqual([0, 0, 0, 0, 0, 0]);

      const history = await service.list({ page: 1, limit: 20 });
      expect(history.meta.total).toBe(4);
      expect(history.items.every((movement) => movement.status === MovementStatus.Canceled)).toBe(true);
      expect((await service.getById(review.id)).items[0].distributions).toHaveLength(3);
      expect((await service.getById(transfer.id)).items[0].destinationBatchId).toBe(batchAEmptyId);
    });
  });
});
