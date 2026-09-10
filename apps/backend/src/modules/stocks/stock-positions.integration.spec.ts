import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { databaseEntities, databaseMigrations } from '../../database/typeorm.config';
import { BatchEntity } from '../batches/entities/batch.entity';
import { BatchesRepository } from '../batches/batches.repository';
import { ProductEntity } from '../products/entities/product.entity';
import { ProductsRepository } from '../products/products.repository';
import { StockLocationEntity } from './entities/stock-location.entity';
import { StockPositionEntity } from './entities/stock-position.entity';
import { StockLocationsRepository } from './stock-locations.repository';
import { StockPositionsRepository, StockPositionKey } from './stock-positions.repository';
import { StockPositionsService } from './stock-positions.service';

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('StockPositionsService (PostgreSQL)', () => {
  let dataSource: DataSource;
  let service: StockPositionsService;
  let repository: StockPositionsRepository;
  let key: StockPositionKey;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      url: databaseUrl,
      entities: databaseEntities,
      migrations: databaseMigrations,
      migrationsTableName: 'schema_migrations',
      dropSchema: true,
      migrationsRun: true,
      synchronize: false,
      logging: false,
    });
    await dataSource.initialize();

    repository = new StockPositionsRepository(dataSource.getRepository(StockPositionEntity));
    service = new StockPositionsService(
      repository,
      new ProductsRepository(dataSource.getRepository(ProductEntity)),
      new BatchesRepository(dataSource.getRepository(BatchEntity)),
      new StockLocationsRepository(dataSource.getRepository(StockLocationEntity)),
    );

    const userId = randomUUID();
    await dataSource.query(
      `INSERT INTO users (id, username, password_hash, status) VALUES ($1, $2, $3, 'ACTIVE')`,
      [userId, 'integration-user', '$argon2id$integration-test-placeholder'],
    );
    const productId = randomUUID();
    const batchId = randomUUID();
    await dataSource.query(
      `INSERT INTO products (id, code, name, default_unit, created_by, updated_by)
       VALUES ($1, 'INT-001', 'Produto de integracao', 'UN', $2, $2)`,
      [productId, userId],
    );
    await dataSource.query(
      `INSERT INTO batches (id, product_id, code, manufacturing_date, expiration_date, created_by, updated_by)
       VALUES ($1, $2, 'SOCDNV', '2026-08-31', '2027-08-31', $3, $3)`,
      [batchId, productId, userId],
    );
    const location = await dataSource.getRepository(StockLocationEntity).findOneByOrFail({
      code: 'REVISAR',
    });
    key = { productId, batchId, stockLocationId: location.id };
  });

  beforeEach(async () => {
    await dataSource.getRepository(StockPositionEntity).clear();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('mantem uma unica posicao e acumula adicoes atomicas', async () => {
    await dataSource.transaction((manager) => service.addQuantity(key, 4, manager));
    await dataSource.transaction((manager) => service.addQuantity(key, 6, manager));

    expect(await service.getBalance(key)).toBe(10);
    expect(await dataSource.getRepository(StockPositionEntity).count()).toBe(1);
    await expect(dataSource.getRepository(StockPositionEntity).insert({
      id: randomUUID(),
      ...key,
      quantity: 1,
    })).rejects.toMatchObject({ code: '23505' });
  });

  it('remove saldo valido e rejeita saldo insuficiente sem alterar a posicao', async () => {
    await dataSource.transaction((manager) => service.addQuantity(key, 10, manager));
    await dataSource.transaction((manager) => service.removeQuantity(key, 4, manager));

    await expect(dataSource.transaction((manager) => service.removeQuantity(key, 7, manager)))
      .rejects.toBeInstanceOf(ConflictException);
    expect(await service.getBalance(key)).toBe(6);
  });

  it('reverte a alteracao quando a transacao externa falha', async () => {
    await expect(dataSource.transaction(async (manager) => {
      await service.addQuantity(key, 8, manager);
      throw new Error('falha posterior simulada');
    })).rejects.toThrow('falha posterior simulada');

    expect(await service.getBalance(key)).toBe(0);
  });

  it('impede saldo negativo sob remocoes concorrentes', async () => {
    await dataSource.transaction((manager) => service.addQuantity(key, 10, manager));
    const results = await Promise.allSettled([
      dataSource.transaction((manager) => service.removeQuantity(key, 8, manager)),
      dataSource.transaction((manager) => service.removeQuantity(key, 8, manager)),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await service.getBalance(key)).toBe(2);
  });

  it('combina filtros de produto, lote e local na consulta paginada', async () => {
    await dataSource.transaction((manager) => service.addQuantity(key, 12, manager));
    const result = await service.list({ ...key, page: 1, limit: 20 });

    expect(result.meta.total).toBe(1);
    expect(result.items[0]).toMatchObject({ ...key, quantity: 12 });
    expect(result.items[0].product.code).toBe('INT-001');
    expect(result.items[0].batch.code).toBe('SOCDNV');
    expect(result.items[0].stockLocation.code).toBe('REVISAR');
  });
});
