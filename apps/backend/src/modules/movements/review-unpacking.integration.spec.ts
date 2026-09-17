import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { databaseEntities, databaseMigrations } from '../../database/typeorm.config';
import { AuditService } from '../audit/audit.service';
import { AuditRepository } from '../audit/audit.repository';
import { AuditLogEntity } from '../audit/entities/audit-log.entity';
import { AuditRequestMetadata } from '../audit/audit.types';
import { OperationalLotsService } from '../batches/operational-lots.service';
import { BatchCodeCodec } from '../batches/domain/batch-code.codec';
import { BatchEntity } from '../batches/entities/batch.entity';
import { BatchesRepository } from '../batches/batches.repository';
import { ProductsRepository } from '../products/products.repository';
import { ProductsService } from '../products/products.service';
import { ProductEntity } from '../products/entities/product.entity';
import { ReportsRepository } from '../reports/reports.repository';
import { StockPositionsRepository } from '../stocks/stock-positions.repository';
import { StockPositionsService } from '../stocks/stock-positions.service';
import { StockLocationsRepository } from '../stocks/stock-locations.repository';
import { StockPositionEntity } from '../stocks/entities/stock-position.entity';
import { StockLocationEntity } from '../stocks/entities/stock-location.entity';
import { MovementsService } from './movements.service';
import { MovementsRepository } from './movements.repository';
import { MovementEntity } from './entities/movement.entity';
import { MovementItemEntity } from './entities/movement-item.entity';
import { MovementItemDistributionEntity } from './entities/movement-item-distribution.entity';
import { CreateReviewDto } from './dto/create-review.dto';
import { ReviewPackageUnpacking1789516800000 } from '../../database/migrations/1789516800000-review-package-unpacking';

const databaseUrl = process.env.TEST_DATABASE_URL;
(databaseUrl ? describe : describe.skip)('Revisão com desmontagem (PostgreSQL)', () => {
  let db: DataSource; let products: ProductsService; let movements: MovementsService; let stock: StockPositionsService; let reports: ReportsRepository; let audit: AuditService;
  let userId: string; let source: string; let lata: string; let varejo: string; let tuf: string; let external: string;
  let unit: ProductEntity; let alternative: ProductEntity; let pack: ProductEntity; let batch: BatchEntity;
  const meta = (): AuditRequestMetadata => ({ requestId: randomUUID(), ipAddress: null, userAgent: 'jest-unpacking' });
  const lot = { code: 'SOCDNV', manufacturingDate: '2026-08-31', expirationDate: '2029-08-31' };

  beforeAll(async () => {
    if (!new URL(databaseUrl!).pathname.endsWith('_test')) throw new Error('Banco descartável _test obrigatório.');
    db = new DataSource({ type: 'postgres', url: databaseUrl, entities: databaseEntities, migrations: databaseMigrations, migrationsTableName: 'schema_migrations', dropSchema: true, migrationsRun: true, synchronize: false });
    await db.initialize();
    await db.undoLastMigration(); await db.runMigrations();
    audit = new AuditService(new AuditRepository(db.getRepository(AuditLogEntity)));
    const repository = new ProductsRepository(db.getRepository(ProductEntity));
    const locations = new StockLocationsRepository(db.getRepository(StockLocationEntity));
    stock = new StockPositionsService(new StockPositionsRepository(db.getRepository(StockPositionEntity)), repository, new BatchesRepository(db.getRepository(BatchEntity)), locations);
    products = new ProductsService(repository, audit, db);
    movements = new MovementsService(new MovementsRepository(db.getRepository(MovementEntity)), locations, stock, audit, db, new OperationalLotsService(db, new BatchCodeCodec()));
    reports = new ReportsRepository(db.getRepository(MovementItemEntity), db.getRepository(MovementItemDistributionEntity), db.getRepository(StockPositionEntity), db.getRepository(StockLocationEntity));
    userId = randomUUID();
    await db.query("INSERT INTO users(id,username,password_hash) VALUES ($1,'unpacking-test','$argon2id$test')", [userId]);
    source = (await db.getRepository(StockLocationEntity).findOneByOrFail({ code: 'REVISAR' })).id;
    lata = (await db.getRepository(StockLocationEntity).findOneByOrFail({ code: 'LATA_BOA' })).id;
    varejo = (await db.getRepository(StockLocationEntity).findOneByOrFail({ code: 'VAREJO' })).id;
    tuf = (await db.getRepository(StockLocationEntity).findOneByOrFail({ code: 'TUF' })).id;
    external = randomUUID();
    await db.query("INSERT INTO stock_locations(id,code,name,kind,created_by,updated_by) VALUES ($1,'EXTRA','Externo teste','EXTERNAL',$2,$2)", [external,userId]);
  });
  beforeEach(async () => {
    jest.restoreAllMocks();
    await db.query('TRUNCATE audit_logs, products, movements, shipments, stock_positions CASCADE');
    unit = await products.create({ code: 'UN-A', name: 'Produto unitário A', defaultUnit: 'UN', unitWeightGrams: 350, shelfLifeYears: 3 }, userId, meta());
    alternative = await products.create({ code: 'UN-B', name: 'Produto unitário B', defaultUnit: 'UN', unitWeightGrams: 500, shelfLifeYears: 3 }, userId, meta());
    pack = await products.create({ code: 'CX-A', name: 'Caixa A', defaultUnit: 'CX', shelfLifeYears: 3, unitsPerPackage: 12, unitProductIds: [unit.id, alternative.id] }, userId, meta());
    const entry = await movements.createExternalEntry({ requestKey: randomUUID(), originLocationId: external, destinationLocationId: source, items: [{ productId: pack.id, lot, quantity: 20 }] }, userId, meta());
    batch = entry.items[0].batch;
  });
  afterAll(async () => { if (db?.isInitialized) await db.destroy(); });
  const review = (outputProductId = unit.id, quantity = 10): CreateReviewDto => ({ requestKey: randomUUID(), items: [{ productId: pack.id, batchId: batch.id, quantity, outputProductId, expectedUnitsPerPackage: 12,
    distributions: [{ destinationLocationId: lata, quantity: quantity * 8 }, { destinationLocationId: varejo, quantity: quantity * 3 }, { destinationLocationId: tuf, quantity }] }] });
  const balance = (productId: string, batchId: string, stockLocationId: string): Promise<number> => stock.getBalance({ productId, batchId, stockLocationId });

  it('10 CX × 12 = 120 UN: debita embalagem, credita três destinos e conserva lote/datas', async () => {
    const result = await movements.createReview(review(), userId, meta());
    const item = result.items[0];
    expect(item).toMatchObject({ productId: pack.id, quantity: 10, unitsPerPackage: 12, outputQuantity: 120, outputProductId: unit.id });
    expect(item.outputBatch).toMatchObject(lot);
    expect(await balance(pack.id, batch.id, source)).toBe(10);
    for (const [location, quantity] of [[lata,80],[varejo,30],[tuf,10]] as const) expect(await balance(unit.id, item.outputBatchId!, location)).toBe(quantity);
    const report = await reports.reviews({ page: 1, limit: 20, productId: unit.id });
    expect(report.totals.reviewedQuantityByUnit).toEqual([{ unit: 'UN', quantity: 120 }]);
    expect(report.items).toHaveLength(3); expect(report.items[0]).toMatchObject({ productCode: 'UN-A', unit: 'UN', batchId: item.outputBatchId });
    const history = await reports.movements({ page: 1, limit: 20, productId: unit.id });
    expect(history.items[0]).toMatchObject({ quantity: 10, unit: 'CX', outputQuantity: 120, outputProductCode: 'UN-A' });
  });

  it('seleciona a segunda opção e impede códigos não vinculados, ausentes ou embalagens', async () => {
    const result = await movements.createReview(review(alternative.id), userId, meta());
    expect(result.items[0].outputProductId).toBe(alternative.id);
    const other = await products.create({ code: 'UN-C', name: 'Outro', defaultUnit: 'UN', unitWeightGrams: 250, shelfLifeYears: 3 }, userId, meta());
    for (const id of [other.id, pack.id, undefined]) {
      const dto = review(); dto.items[0].outputProductId = id;
      await expect(movements.createReview(dto, userId, meta())).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('bloqueia soma incorreta, fator desatualizado e saldo insuficiente', async () => {
    const wrongSum = review(); wrongSum.items[0].distributions[0].quantity++;
    await expect(movements.createReview(wrongSum, userId, meta())).rejects.toBeInstanceOf(BadRequestException);
    const wrongFactor = review(); wrongFactor.items[0].expectedUnitsPerPackage = 24;
    await expect(movements.createReview(wrongFactor, userId, meta())).rejects.toBeInstanceOf(ConflictException);
    await expect(movements.createReview(review(unit.id, 21), userId, meta())).rejects.toBeInstanceOf(ConflictException);
    expect(await balance(pack.id, batch.id, source)).toBe(20);
    expect(await db.getRepository(BatchEntity).countBy({ productId: unit.id })).toBe(0);
  });

  it('estorno usa o snapshot: bloqueia consumo posterior e restaura embalagens após devolver unidades', async () => {
    const reviewed = await movements.createReview(review(), userId, meta()); const item = reviewed.items[0];
    const exit = await movements.createExternalExit({ requestKey: randomUUID(), originLocationId: lata, destinationLocationId: external, items: [{ productId: unit.id, batchId: item.outputBatchId!, quantity: 5 }] }, userId, meta());
    await expect(movements.cancel(reviewed.id, { reason: 'Correção' }, userId, meta())).rejects.toBeInstanceOf(ConflictException);
    expect(await balance(unit.id, item.outputBatchId!, varejo)).toBe(30);
    await movements.cancel(exit.id, { reason: 'Devolução' }, userId, meta());
    await products.update(pack.id, { name: 'Caixa renomeada', unitProductIds: [alternative.id] }, userId, meta());
    await products.setStatus(unit.id, false, userId, meta());
    await movements.cancel(reviewed.id, { reason: 'Desfazer revisão' }, userId, meta());
    expect(await balance(pack.id, batch.id, source)).toBe(20);
    expect(await balance(unit.id, item.outputBatchId!, lata)).toBe(0);
    expect((await movements.getById(reviewed.id)).items[0].productSnapshot?.name).toBe('Caixa A');
    expect((await reports.reviews({ page: 1, limit: 20 })).totals.reviewedQuantityByUnit).toEqual([]);
    await expect(movements.cancel(reviewed.id, { reason: 'Repetição' }, userId, meta())).rejects.toBeInstanceOf(ConflictException);
  });

  it('reutiliza confirmação de validade divergente sem alterar a validade da embalagem', async () => {
    await db.getRepository(BatchEntity).save(Object.assign(new BatchEntity(), { ...lot, expirationDate: '2030-08-31', productId: unit.id, createdById: userId, updatedById: userId }));
    const dto = review();
    await expect(movements.createReview(dto, userId, meta())).rejects.toBeInstanceOf(ConflictException);
    expect(await balance(pack.id, batch.id, source)).toBe(20);
    dto.confirmedExpirationKeys = [`${unit.id}:${lot.code}:2030-08-31`];
    expect((await movements.createReview(dto, userId, meta())).items[0].outputBatch?.expirationDate).toBe(lot.expirationDate);
  });

  it('rollback integral inclusive lote criado quando a auditoria falha', async () => {
    jest.spyOn(audit, 'record').mockRejectedValueOnce(new Error('audit failure'));
    await expect(movements.createReview(review(), userId, meta())).rejects.toThrow('audit failure');
    expect(await balance(pack.id, batch.id, source)).toBe(20);
    expect(await db.getRepository(BatchEntity).countBy({ productId: unit.id })).toBe(0);
  });

  it('concorrência impede consumo duplo e repetição da chave é idempotente', async () => {
    const dto = review(unit.id, 15);
    const results = await Promise.allSettled([movements.createReview(dto, userId, meta()), movements.createReview(review(unit.id, 15), userId, meta())]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await balance(pack.id, batch.id, source)).toBe(5);
    const fulfilled = results.find((result) => result.status === 'fulfilled')!;
    if (fulfilled.status === 'fulfilled') {
      const repeatDto = { ...dto, requestKey: fulfilled.value.requestKey };
      expect((await movements.createReview(repeatDto, userId, meta())).id).toBe(fulfilled.value.id);
    }
  });

  it('valida cadastro, vínculos e protege unidade/fator de produtos já utilizados', async () => {
    await expect(products.create({ code: 'BAD', name: 'Sem conteúdo', defaultUnit: 'FD', shelfLifeYears: 3 }, userId, meta())).rejects.toBeInstanceOf(BadRequestException);
    await expect(products.update(pack.id, { unitsPerPackage: 24 }, userId, meta())).rejects.toBeInstanceOf(ConflictException);
    await expect(products.update(unit.id, { defaultUnit: 'CX', unitsPerPackage: 6, unitProductIds: [alternative.id] }, userId, meta())).rejects.toBeInstanceOf(ConflictException);
    await expect(products.update(pack.id, { unitProductIds: [pack.id] }, userId, meta())).rejects.toBeInstanceOf(BadRequestException);
    expect((await products.getById(pack.id)).unitProducts).toHaveLength(2);
    const runner = db.createQueryRunner();
    try { await expect(new ReviewPackageUnpacking1789516800000().down(runner)).rejects.toThrow('rollback destrutivo'); }
    finally { await runner.release(); }
  });

  it('revisa embalagem e produto UN com outro lote na mesma operação e estorna ambos', async () => {
    const entry = await movements.createExternalEntry({ requestKey: randomUUID(), originLocationId: external, destinationLocationId: source, items: [{ productId: alternative.id, lot: { code: 'COCINV', manufacturingDate: '2026-09-01', expirationDate: '2029-09-01' }, quantity: 10 }] }, userId, meta());
    const dto = review();
    dto.items.push({ productId: alternative.id, batchId: entry.items[0].batchId, quantity: 6, distributions: [{ destinationLocationId: lata, quantity: 3 }, { destinationLocationId: tuf, quantity: 3 }] });
    const result = await movements.createReview(dto, userId, meta());
    expect(result.items).toHaveLength(2);
    expect(await balance(alternative.id, entry.items[0].batchId, source)).toBe(4);
    expect((await reports.reviews({ page: 1, limit: 20 })).totals.reviewedQuantityByUnit).toEqual([{ unit: 'UN', quantity: 126 }]);
    await movements.cancel(result.id, { reason: 'Estorno misto' }, userId, meta());
    expect(await balance(pack.id, batch.id, source)).toBe(20);
    expect(await balance(alternative.id, entry.items[0].batchId, source)).toBe(10);
  });

  it('falha no segundo item reverte também a primeira transformação', async () => {
    const emptyBatch = await db.getRepository(BatchEntity).save(Object.assign(new BatchEntity(), { ...lot, code: 'COCINV', manufacturingDate: '2026-09-01', productId: pack.id, createdById: userId, updatedById: userId }));
    const dto = review(); dto.items.push({ ...dto.items[0], batchId: emptyBatch.id });
    await expect(movements.createReview(dto, userId, meta())).rejects.toBeInstanceOf(ConflictException);
    expect(await balance(pack.id, batch.id, source)).toBe(20);
    expect(await db.getRepository(BatchEntity).countBy({ productId: unit.id })).toBe(0);
  });
});
