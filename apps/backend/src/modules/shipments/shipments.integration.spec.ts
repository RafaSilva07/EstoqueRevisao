import { randomUUID } from 'node:crypto';
import { ShipmentObservations1789430400000 } from '../../database/migrations/1789430400000-shipment-observations';
import { AdministrativeShipmentCorrections1791417600000 } from '../../database/migrations/1791417600000-administrative-shipment-corrections';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { databaseEntities, databaseMigrations } from '../../database/typeorm.config';
import { AuditService } from '../audit/audit.service';
import { AuditRepository } from '../audit/audit.repository';
import { AuditLogEntity } from '../audit/entities/audit-log.entity';
import { AuditRequestMetadata } from '../audit/audit.types';
import { AuthenticatedUser } from '../auth/authenticated-user.interface';
import { OperationalLotsService } from '../batches/operational-lots.service';
import { BatchCodeCodec } from '../batches/domain/batch-code.codec';
import { BatchEntity } from '../batches/entities/batch.entity';
import { BatchesRepository } from '../batches/batches.repository';
import { ProductEntity } from '../products/entities/product.entity';
import { ProductsRepository } from '../products/products.repository';
import { StockLocationEntity } from '../stocks/entities/stock-location.entity';
import { StockPositionEntity } from '../stocks/entities/stock-position.entity';
import { StockLocationsRepository } from '../stocks/stock-locations.repository';
import { StockPositionsRepository } from '../stocks/stock-positions.repository';
import { StockLocationsService } from '../stocks/stock-locations.service';
import { StockLocationKind } from '../stocks/domain/stock-location-kind.enum';
import { StockPositionsService } from '../stocks/stock-positions.service';
import { MovementEntity } from '../movements/entities/movement.entity';
import { MovementStatus } from '../movements/domain/movement-status.enum';
import { MovementItemEntity } from '../movements/entities/movement-item.entity';
import { MovementsRepository } from '../movements/movements.repository';
import { MovementsService } from '../movements/movements.service';
import { Sector, ShipmentEntity, ShipmentItemAdditionalPhotoEntity, ShipmentItemEntity } from './shipment.entity';
import { ShipmentsService } from './shipments.service';
import { CreateShipmentDto, ShipmentQueryDto } from './shipment.dto';
import { StorageService, UploadedImage } from '../storage/storage.service';
import { HistoryService } from '../history/history.service';
import { HistoryQueryDto } from '../history/history-query.dto';
import { SettingsService } from '../settings/settings.service';
import { PcpMovementsService } from '../pcp/pcp-movements.service';
import { PcpMovementsRepository } from '../pcp/pcp-movements.repository';

const databaseUrl = process.env.TEST_DATABASE_URL;
(databaseUrl ? describe : describe.skip)('Envios entre setores (PostgreSQL)', () => {
  let db: DataSource; let service: ShipmentsService; let stock: StockPositionsService; let movements: MovementsService; let audit: AuditService;
  let users: Record<Sector, AuthenticatedUser>; let productId: string; let packageId: string; let batchId: string; let sourceId: string; let tufId: string; let lataBoaId: string;
  const metadata = (): { requestId: string; ipAddress: null; userAgent: string } => ({ requestId: randomUUID(), ipAddress: null, userAgent: 'jest-shipments' });
  beforeAll(async () => {
    if (!new URL(databaseUrl!).pathname.endsWith('_test')) throw new Error('Banco descartável _test obrigatório.');
    db = new DataSource({ type: 'postgres', url: databaseUrl, entities: databaseEntities, migrations: databaseMigrations,
      migrationsTableName: 'schema_migrations', dropSchema: true, migrationsRun: true, synchronize: false });
    await db.initialize();
    const locations = new StockLocationsRepository(db.getRepository(StockLocationEntity));
    stock = new StockPositionsService(new StockPositionsRepository(db.getRepository(StockPositionEntity)), new ProductsRepository(db.getRepository(ProductEntity)), new BatchesRepository(db.getRepository(BatchEntity)), locations);
    audit = new AuditService(new AuditRepository(db.getRepository(AuditLogEntity)));
    const lots = new OperationalLotsService(db, new BatchCodeCodec());
    const repository = new MovementsRepository(db.getRepository(MovementEntity));
    movements = new MovementsService(repository, locations, stock, audit, db, lots);
    const storage = {
      validateImage: jest.fn(), saveImage: jest.fn((file: UploadedImage) => Promise.resolve({ key: `shipments/2026/09/${randomUUID()}.jpg`, mimeType: file.mimetype, size: file.size })),
      deleteImage: jest.fn(() => Promise.resolve()), readImage: jest.fn(() => Promise.resolve(Buffer.from('photo'))),
    } as unknown as StorageService;
    service = new ShipmentsService(db, lots, stock, repository, audit, storage, new SettingsService(db, audit));
    users = {} as Record<Sector, AuthenticatedUser>;
    for (const sector of ['REVISAO','PRODUCAO','EXPEDICAO'] as const) {
      const id = randomUUID();
      await db.query(`INSERT INTO users(id,username,password_hash,sector) VALUES ($1,$2,'$argon2id$test',$2)`, [id,sector]);
      users[sector] = { id, sector, username: sector, sessionId: randomUUID(), roles: [], permissions: ['shipments.read','shipments.create','shipments.decide'] };
    }
    productId = randomUUID(); batchId = randomUUID();
    await db.query(`INSERT INTO products(id,code,name,default_unit,shelf_life_years,created_by,updated_by) VALUES ($1,'500001','Produto do envio','UN',2,$2,$2)`, [productId,users.REVISAO.id]);
    packageId = randomUUID();
    await db.query(`INSERT INTO products(id,code,name,default_unit,units_per_package,shelf_life_years,created_by,updated_by)
      VALUES ($1,'500002','Fardo do envio','FD',10,2,$2,$2)`, [packageId, users.REVISAO.id]);
    await db.query('INSERT INTO product_unit_options(package_product_id,unit_product_id) VALUES ($1,$2)', [packageId, productId]);
    await db.query(`INSERT INTO batches(id,product_id,code,manufacturing_date,expiration_date,created_by,updated_by) VALUES ($1,$2,'SOCDNV','2026-08-31','2028-08-31',$3,$3)`, [batchId,productId,users.REVISAO.id]);
    sourceId = (await db.getRepository(StockLocationEntity).findOneByOrFail({ code: 'REVISAR' })).id;
    tufId = (await db.getRepository(StockLocationEntity).findOneByOrFail({ code: 'TUF' })).id;
    lataBoaId = (await db.getRepository(StockLocationEntity).findOneByOrFail({ code: 'LATA_BOA' })).id;
  });
  beforeEach(async () => {
    jest.restoreAllMocks();
    await db.query('TRUNCATE audit_logs, movements, stock_positions, shipments CASCADE');
    await db.query('DELETE FROM batches WHERE product_id = $1 AND id <> $2', [productId, batchId]);
    await db.query("UPDATE system_settings SET value = CASE key WHEN 'shipment_photo_minimum' THEN '1' ELSE '5' END WHERE key IN ('shipment_photo_minimum', 'shipment_photo_maximum')");
    await db.query('UPDATE products SET active = true WHERE id = $1', [productId]);
  });
  afterAll(async () => { if (db?.isInitialized) await db.destroy(); });
  it('reverte e reaplica a migration administrativa sem perder a constraint de recebimento', async () => {
    const runner = db.createQueryRunner();
    await runner.connect(); await runner.startTransaction();
    try {
      const migration = new AdministrativeShipmentCorrections1791417600000();
      await migration.down(runner); await migration.up(runner);
      const constraints = await runner.query("SELECT 1 FROM pg_constraint WHERE conname='shipment_separation_state'") as unknown[];
      expect(constraints).toHaveLength(1);
    } finally { await runner.rollbackTransaction(); await runner.release(); }
  });
  const image = (): UploadedImage => ({ buffer: Buffer.from('valid-photo'), mimetype: 'image/jpeg', size: 11, originalname: 'ignored.jpg' });
  const createShipment = (dto: CreateShipmentDto, user: AuthenticatedUser, meta: AuditRequestMetadata): Promise<ShipmentEntity> =>
    service.create(dto, dto.items.map(image), user, meta);
  const incoming = (sector: 'PRODUCAO' | 'EXPEDICAO' = 'PRODUCAO', confirmedDuplicateKeys?: string[], requestKey = randomUUID()): Promise<ShipmentEntity> => createShipment({ requestKey, confirmedDuplicateKeys, destinationSector: 'REVISAO',
    ...(sector === 'EXPEDICAO' ? { loadingStatus: 'NAO_CARREGADO' as const } : {}), items: [{ productId, batchId, quantity: 10 }] }, users[sector], metadata());
  const reserve = (destinationSector: 'PRODUCAO' | 'EXPEDICAO' = 'PRODUCAO', quantity = 6, requestKey = randomUUID()): Promise<ShipmentEntity> => createShipment({ requestKey, destinationSector, items: [{ productId, batchId, stockLocationId: sourceId, quantity }] }, users.REVISAO, metadata());
  const balance = (location = sourceId): Promise<number> => stock.getBalance({ productId, batchId, stockLocationId: location });
  const seed = (quantity = 10, location = sourceId): Promise<StockPositionEntity> => db.transaction((manager) => stock.addQuantity({ productId, batchId, stockLocationId: location }, quantity, manager));
  const decide = (id: string, sector: Sector, refuse = false): Promise<ShipmentEntity> => service.decide(id, refuse ? 'RECUSADO' : 'CONFIRMADO', refuse ? 'Quantidade divergente' : null, {}, users[sector], metadata());

  async function duplicateWarning(operation: Promise<unknown>): Promise<string[]> {
    try { await operation; }
    catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      const response = (error as ConflictException).getResponse() as { code: string; details: { duplicateKeys: string[] } };
      expect(response.code).toBe('RECENT_DUPLICATE_CONFIRMATION_REQUIRED');
      return response.details.duplicateKeys;
    }
    throw new Error('Esperado aviso de duplicidade.');
  }
  it.each(['PRODUCAO', 'EXPEDICAO'] as const)('avisa envio %s idêntico antes do recebimento e permite seguir', async (sector) => {
    const first = await incoming(sector);
    const key = randomUUID(); const confirmed = await duplicateWarning(incoming(sector, undefined, key));
    expect(await db.getRepository(ShipmentEntity).count()).toBe(1); expect(await balance()).toBe(0);
    const second = await incoming(sector, confirmed, key);
    expect(second.id).not.toBe(first.id); expect(await incoming(sector, undefined, key)).toMatchObject({ id: second.id });
    expect((await db.getRepository(AuditLogEntity).findOneByOrFail({ entityId: second.id, action: 'SHIPMENT_CREATE' })).newValues).toMatchObject({ confirmedDuplicateKeys: confirmed });
  });
  it('avisa envio da Revisão sem reservar duas vezes nem manter fotos do envio rejeitado', async () => {
    await seed(100); await reserve();
    const storage = (service as unknown as { storage: StorageService }).storage;
    const removePhoto = jest.spyOn(storage, 'deleteImage');
    const confirmed = await duplicateWarning(reserve());
    expect(removePhoto).toHaveBeenCalled(); expect(await balance()).toBe(94);
    await createShipment({ requestKey: randomUUID(), confirmedDuplicateKeys: confirmed, destinationSector: 'PRODUCAO',
      items: [{ productId, batchId, stockLocationId: sourceId, quantity: 6 }] }, users.REVISAO, metadata());
    expect(await balance()).toBe(88);
  });
  it('ignora envios recusados/cancelados e diferencia o setor destinatário', async () => {
    const first = await incoming(); await decide(first.id, 'REVISAO', true);
    const second = await incoming(); await service.cancel(second.id, 'Teste', users.PRODUCAO, metadata());
    await expect(incoming()).resolves.toBeDefined();
    await seed(20); await reserve('PRODUCAO'); await expect(reserve('EXPEDICAO')).resolves.toBeDefined();
  });
  it('montagem idêntica considera parcelas reordenadas e produto da embalagem', async () => {
    await seed(100); await seed(100, lataBoaId);
    const sources = [{ batchId, stockLocationId: sourceId, quantity: 12 }, { batchId, stockLocationId: lataBoaId, quantity: 8 }];
    const input: CreateShipmentDto = { requestKey: randomUUID(), destinationSector: 'EXPEDICAO', items: [{ productId, quantity: 2,
      assembly: { packageProductId: packageId, mixedDates: false, sources } }] };
    await createShipment(input, users.REVISAO, metadata());
    const next = { ...input, requestKey: randomUUID(), items: [{ ...input.items[0], assembly: { ...input.items[0].assembly!, sources: [...sources].reverse() } }] };
    const confirmedDuplicateKeys = await duplicateWarning(createShipment(next, users.REVISAO, metadata()));
    expect(await balance()).toBe(88); expect(await balance(lataBoaId)).toBe(92);
    await createShipment({ ...next, confirmedDuplicateKeys }, users.REVISAO, metadata());
    expect(await balance()).toBe(76); expect(await balance(lataBoaId)).toBe(84);
  });
  it('envios concorrentes iguais geram um envio e um aviso, sem duas reservas', async () => {
    await seed(100);
    const results = await Promise.allSettled([reserve(), reserve()]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
    expect((rejected.reason as ConflictException).getResponse()).toMatchObject({ code: 'RECENT_DUPLICATE_CONFIRMATION_REQUIRED' });
    expect(await balance()).toBe(94);
  });
  const assembly = (quantity: number, sources: Array<{ batchId: string; stockLocationId: string; quantity: number }>, mixedDates = false): Promise<ShipmentEntity> =>
    createShipment({ requestKey: randomUUID(), destinationSector: 'EXPEDICAO', items: [{ productId, quantity,
      assembly: { packageProductId: packageId, mixedDates, sources } }] }, users.REVISAO, metadata());

  it('monta fardos de um lote, reserva UN uma vez e mantém o produto FD no histórico do envio', async () => {
    await seed(12); await seed(8, lataBoaId);
    const options = await service.assemblyOptions({ productId, page: 1, limit: 20 }, users.REVISAO);
    expect(options.availableUnits).toBe(20);
    expect(options.availableByBatch).toEqual([expect.objectContaining({ batchId, code: 'SOCDNV', availableUnits: 20 })]);
    expect(options.packages).toEqual(expect.arrayContaining([expect.objectContaining({ id: packageId, unitsPerPackage: 10 })]));
    const shipment = await assembly(2, [{ batchId, stockLocationId: sourceId, quantity: 12 },
      { batchId, stockLocationId: lataBoaId, quantity: 8 }]);
    expect(shipment).toMatchObject({ shipmentKind: 'MONTAGEM', items: [{ quantity: 20,
      assembly: { packageQuantity: 2, outputLot: 'SOCDNV', mixedDates: false } }] });
    expect(await balance()).toBe(0); expect(await balance(lataBoaId)).toBe(0);
    await decide(shipment.id, 'EXPEDICAO');
    expect(await balance()).toBe(0); expect(await balance(lataBoaId)).toBe(0);
    const movement = await db.getRepository(MovementEntity).findOne({ where: { shipmentId: shipment.id }, relations: { items: true } });
    expect(movement?.items[0]).toMatchObject({ quantity: 20, assembly: { packageQuantity: 2, packageProductId: packageId } });
    const history = await new HistoryService(db).list(Object.assign(new HistoryQueryDto(), { page: 1, limit: 10 }), users.REVISAO);
    const record = history.items.find((item) => item.code === shipment.items[0].codigoRegistro);
    expect(record).toMatchObject({ productCode: '500002', productUnit: 'FD', quantity: 2, batchCode: 'SOCDNV' });
    expect(record?.origin).toContain('Lata Boa');
  });

  it('separa a capacidade por lote/data e filtra apenas as posições do lote escolhido', async () => {
    const secondBatchId = randomUUID();
    await db.query(`INSERT INTO batches(id,product_id,code,manufacturing_date,expiration_date,created_by,updated_by)
      VALUES ($1,$2,'SOCDNA','2026-09-01','2028-09-01',$3,$3)`, [secondBatchId, productId, users.REVISAO.id]);
    await seed(6); await seed(5, lataBoaId);
    await db.transaction((manager) => stock.addQuantity({ productId, batchId: secondBatchId, stockLocationId: tufId }, 15, manager));
    const options = await service.assemblyOptions({ productId, batchId, page: 1, limit: 20 }, users.REVISAO);
    expect(options.availableUnits).toBe(26);
    expect(options.availableByBatch).toEqual([
      expect.objectContaining({ batchId, manufacturingDate: '2026-08-31', availableUnits: 11 }),
      expect.objectContaining({ batchId: secondBatchId, manufacturingDate: '2026-09-01', availableUnits: 15 }),
    ]);
    expect(options.availableByBatch[0].positions).toEqual([
      expect.objectContaining({ stockLocationName: 'Lata Boa', availableUnits: 5 }),
      expect.objectContaining({ stockLocationName: 'Revisar', availableUnits: 6 }),
    ]);
    expect(options.availableByBatch[1].positions).toEqual([
      expect.objectContaining({ stockLocationName: 'TUF', availableUnits: 15 }),
    ]);
    expect(options.positions.items).toHaveLength(2);
    expect(options.positions.items.every((position) => position.batchId === batchId)).toBe(true);
  });

  it('montagem Lote 0 preserva datas reais nas parcelas e recusa/cancelamento devolvem cada origem', async () => {
    const secondBatchId = randomUUID();
    await db.query(`INSERT INTO batches(id,product_id,code,manufacturing_date,expiration_date,created_by,updated_by)
      VALUES ($1,$2,'SOCDNA','2026-09-01','2028-09-01',$3,$3)`, [secondBatchId, productId, users.REVISAO.id]);
    await seed(5);
    await db.transaction((manager) => stock.addQuantity({ productId, batchId: secondBatchId, stockLocationId: tufId }, 5, manager));
    const sources = [{ batchId, stockLocationId: sourceId, quantity: 5 }, { batchId: secondBatchId, stockLocationId: tufId, quantity: 5 }];
    const refused = await assembly(1, sources, true);
    expect(refused.items[0].assembly).toMatchObject({ outputLot: '0', outputManufacturingDate: null,
      outputExpirationDate: null, sources: [{ quantity: 5 }, { quantity: 5 }] });
    const history = await new HistoryService(db).list(Object.assign(new HistoryQueryDto(), { page: 1, limit: 10 }), users.REVISAO);
    expect(history.items).toEqual(expect.arrayContaining([expect.objectContaining({ code: refused.items[0].codigoRegistro,
      batchCode: '0', manufacturingDate: null, quantity: 1, productCode: '500002' })]));
    expect(await balance()).toBe(0);
    await decide(refused.id, 'EXPEDICAO', true);
    expect(await balance()).toBe(5);
    expect(await stock.getBalance({ productId, batchId: secondBatchId, stockLocationId: tufId })).toBe(5);
    const canceled = await assembly(1, sources, true);
    await service.cancel(canceled.id, 'Montagem não será enviada', users.REVISAO, metadata());
    expect(await balance()).toBe(5);
    expect(await stock.getBalance({ productId, batchId: secondBatchId, stockLocationId: tufId })).toBe(5);
  });

  it('bloqueia soma incorreta, embalagem incompatível e falta de saldo sem reserva parcial', async () => {
    await seed(10);
    const source = { batchId, stockLocationId: sourceId, quantity: 9 };
    await expect(assembly(1, [source])).rejects.toBeInstanceOf(BadRequestException);
    expect(await balance()).toBe(10);
    await expect(assembly(2, [{ ...source, quantity: 20 }])).rejects.toBeInstanceOf(BadRequestException);
    expect(await balance()).toBe(10);
    await expect(createShipment({ requestKey: randomUUID(), destinationSector: 'EXPEDICAO', items: [{ productId, quantity: 1,
      assembly: { packageProductId: productId, mixedDates: false, sources: [{ ...source, quantity: 10 }] } }] }, users.REVISAO, metadata()))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(await balance()).toBe(10);
  });

  it('montagem reverte a reserva se a auditoria falhar e impede consumo concorrente duplicado', async () => {
    await seed(10);
    const sources = [{ batchId, stockLocationId: sourceId, quantity: 10 }];
    jest.spyOn(audit, 'record').mockRejectedValueOnce(new Error('audit failed'));
    await expect(assembly(1, sources)).rejects.toThrow('audit failed');
    expect(await balance()).toBe(10);
    expect(await db.getRepository(ShipmentEntity).count()).toBe(0);
    const attempts = await Promise.allSettled([assembly(1, sources), assembly(1, sources)]);
    expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await balance()).toBe(0);
  });

  it('Produção → Revisão: pendente não altera saldo; confirma uma entrada e guarda responsáveis', async () => {
    const shipment = await incoming();
    expect(shipment.status).toBe('AGUARDANDO_RECEBIMENTO'); expect(await balance()).toBe(0);
    expect(await db.getRepository(MovementEntity).count()).toBe(0);
    const confirmed = await decide(shipment.id, 'REVISAO');
    expect(confirmed.status).toBe('CONFIRMADO'); expect(confirmed.createdById).toBe(users.PRODUCAO.id);
    expect(confirmed.decidedById).toBe(users.REVISAO.id); expect(confirmed.decidedAt).toBeInstanceOf(Date);
    expect(await balance()).toBe(10);
    const movement = await db.getRepository(MovementEntity).findOneByOrFail({ shipmentId: shipment.id });
    expect(movement.type).toBe('ENTRADA_EXTERNA'); expect(movement.destinationLocationId).toBe(sourceId);
    expect(shipment.items[0].codigoRegistro).toBe(`${shipment.codigoMovimentacao}-A`);
    const linkedCode = (await db.query<Array<{ codigo_registro: string }>>(
      'SELECT codigo_registro FROM movement_items WHERE movement_id=$1', [movement.id]))[0].codigo_registro;
    expect(linkedCode).toBe(shipment.items[0].codigoRegistro);
    expect(await db.getRepository(AuditLogEntity).countBy({ entityId: shipment.id })).toBe(2);
  });
  it('Expedição → Revisão exige carregamento, registra placa quando carregado e protege a rota no banco', async () => {
    const base: CreateShipmentDto = { requestKey: randomUUID(), destinationSector: 'REVISAO', items: [{ productId, batchId, quantity: 2 }] };
    await expect(createShipment(base, users.EXPEDICAO, metadata())).rejects.toBeInstanceOf(BadRequestException);
    await expect(createShipment({ ...base, loadingStatus: 'CARREGADO', vehiclePlate: '  ' }, users.EXPEDICAO, metadata())).rejects.toBeInstanceOf(BadRequestException);
    await expect(createShipment({ ...base, loadingStatus: 'NAO_CARREGADO', vehiclePlate: 'ABC1D23' }, users.EXPEDICAO, metadata())).rejects.toBeInstanceOf(BadRequestException);
    await expect(createShipment({ ...base, loadingStatus: 'CARREGADO', vehiclePlate: 'ABC1D23' }, users.PRODUCAO, metadata())).rejects.toBeInstanceOf(BadRequestException);
    expect(await db.getRepository(ShipmentEntity).count()).toBe(0);
    const loaded = await createShipment({ ...base, loadingStatus: 'CARREGADO', vehiclePlate: ' abc1d23 ' }, users.EXPEDICAO, metadata());
    expect(loaded).toMatchObject({ loadingStatus: 'CARREGADO', vehiclePlate: 'ABC1D23' });
    expect((await db.getRepository(ShipmentEntity).findOneByOrFail({ id: loaded.id })).vehiclePlate).toBe('ABC1D23');
    const expeditionLocation = await db.getRepository(StockLocationEntity).findOneByOrFail({ sector: 'EXPEDICAO' });
    await expect(db.query(`INSERT INTO shipments
      (id, request_key, origin_sector, destination_sector, created_by_id, origin_location_id, destination_location_id, loading_status)
      VALUES ($1, $2, 'EXPEDICAO', 'REVISAO', $3, $4, $5, 'CARREGADO')`,
    [randomUUID(), randomUUID(), users.EXPEDICAO.id, expeditionLocation.id, sourceId])).rejects.toMatchObject({ constraint: 'shipments_loading_check' });
    const unloaded = await incoming('EXPEDICAO');
    expect(unloaded).toMatchObject({ loadingStatus: 'NAO_CARREGADO', vehiclePlate: null });
  });
  it('consolida separação vencida com request UUID válido sem derrubar as consultas', async () => {
    const shipment = await incoming('EXPEDICAO');
    await db.query(`UPDATE shipments SET status='EM_SEPARACAO', received_by_id=$1, received_at=now()-interval '2 hours',
      separation_started_at=now()-interval '2 hours', separation_expires_at=now()-interval '1 hour' WHERE id=$2`,
    [users.REVISAO.id, shipment.id]);
    await expect(service.list(Object.assign(new ShipmentQueryDto(), { view: 'history' }), users.REVISAO)).resolves.toMatchObject({ meta: { total: 1 } });
    expect((await service.get(shipment.id, users.REVISAO)).status).toBe('CONFIRMADO');
    expect(await balance()).toBe(10);
    const expirationAudit = await db.getRepository(AuditLogEntity).findOneByOrFail({ entityId: shipment.id, action: 'SHIPMENT_SEPARATION_EXPIRE' });
    expect(expirationAudit.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('exige uma foto por item e preserva a evidência após confirmação ou recusa', async () => {
    const dto: CreateShipmentDto = { requestKey: randomUUID(), destinationSector: 'REVISAO', items: [{ productId, batchId, quantity: 2 }] };
    await expect(service.create(dto, [], users.PRODUCAO, metadata())).rejects.toBeInstanceOf(BadRequestException);
    const confirmed = await createShipment(dto, users.PRODUCAO, metadata());
    expect(confirmed.items[0]).toMatchObject({ photoMimeType: 'image/jpeg', photoSize: 11 });
    expect((await service.photo(confirmed.id, confirmed.items[0].id, users.REVISAO)).data.toString()).toBe('photo');
    await expect(service.photo(confirmed.id, confirmed.items[0].id, users.EXPEDICAO)).rejects.toBeInstanceOf(NotFoundException);
    await decide(confirmed.id, 'REVISAO');
    expect((await service.get(confirmed.id, users.REVISAO)).items[0].photoMimeType).toBe('image/jpeg');

    const refused = await incoming('EXPEDICAO');
    await decide(refused.id, 'REVISAO', true);
    expect((await service.get(refused.id, users.EXPEDICAO)).items[0].photoMimeType).toBe('image/jpeg');
  });
  it('preserva fotos adicionais por item, impõe limites e reverte falhas da auditoria', async () => {
    const settings = new SettingsService(db, audit);
    await settings.updatePhotoLimits({ minimum: 2, maximum: 3 }, users.REVISAO.id, metadata());
    const dto: CreateShipmentDto = { requestKey: randomUUID(), destinationSector: 'REVISAO', items: [{ productId, batchId, quantity: 2, photoCount: 2 }] };
    await expect(service.create(dto, [image()], users.PRODUCAO, metadata())).rejects.toBeInstanceOf(BadRequestException);
    const shipment = await service.create(dto, [image(), image()], users.PRODUCAO, metadata());
    expect(shipment.items[0].additionalPhotos).toMatchObject([{ ordinal: 2, mimeType: 'image/jpeg', size: 11 }]);
    expect((await service.photo(shipment.id, shipment.items[0].id, users.REVISAO, 2)).data.toString()).toBe('photo');
    await expect(service.photo(shipment.id, shipment.items[0].id, users.EXPEDICAO, 2)).rejects.toBeInstanceOf(NotFoundException);
    await expect(db.getRepository(ShipmentItemAdditionalPhotoEntity).update(shipment.items[0].additionalPhotos[0].id, { size: 12 })).rejects.toThrow();
    const next = { ...dto, requestKey: randomUUID() };
    const confirmedDuplicateKeys = await duplicateWarning(service.create(next, [image(), image()], users.PRODUCAO, metadata()));
    jest.spyOn(audit, 'record').mockRejectedValueOnce(new Error('audit failed'));
    await expect(service.create({ ...next, confirmedDuplicateKeys }, [image(), image()], users.PRODUCAO, metadata())).rejects.toThrow('audit failed');
    expect(await db.getRepository(ShipmentItemAdditionalPhotoEntity).count()).toBe(1);
    expect(await db.getRepository(ShipmentEntity).count()).toBe(1);
  });
  it('aplica fotos múltiplas também ao retorno da separação imediata', async () => {
    const shipment = await incoming('EXPEDICAO');
    await service.decide(shipment.id, 'CONFIRMADO', null, { immediateSeparation: true }, users.REVISAO, metadata());
    const returned = await service.completeSeparation(shipment.id, { items: [{ shipmentItemId: shipment.items[0].id, returnQuantity: 3, photoCount: 2 }] }, [image(), image()], users.REVISAO, metadata());
    expect(returned.status).toBe('CONFIRMADO');
    expect(await balance()).toBe(7);
    expect(await service.get(shipment.id, users.REVISAO)).toMatchObject({ movements: [{ items: [{ quantity: 7, productSnapshot: { code: '500001' } }] }] });
    const derived = await db.getRepository(ShipmentEntity).findOneByOrFail({ sourceShipmentId: shipment.id });
    const detail = await service.get(derived.id, users.REVISAO);
    expect(detail.items[0].additionalPhotos).toMatchObject([{ ordinal: 2, mimeType: 'image/jpeg' }]);
  });
  it('preserva observações do envio e de cada produto no histórico', async () => {
    const shipment = await createShipment({
      requestKey: randomUUID(), destinationSector: 'REVISAO', observation: '  Conferir lacre no recebimento  ',
      items: [{ productId, batchId, quantity: 3, observation: '  Embalagem identificada  ' }],
    }, users.PRODUCAO, metadata());
    expect(shipment.observation).toBe('Conferir lacre no recebimento');
    expect(shipment.items[0].observation).toBe('Embalagem identificada');
    await decide(shipment.id, 'REVISAO');
    const movement = await db.getRepository(MovementEntity).findOneByOrFail({ shipmentId: shipment.id });
    expect(movement.observation).toBe('Conferir lacre no recebimento');
    await expect(db.getRepository(ShipmentEntity).update(shipment.id, { observation: 'Alterada' })).rejects.toThrow();
    await expect(db.getRepository(ShipmentItemEntity).update(shipment.items[0].id, { observation: 'Alterada' })).rejects.toThrow();
  });
  it('Expedição → Revisão: recusa com motivo, sem saldo; correção gera novo documento', async () => {
    const shipment = await incoming('EXPEDICAO');
    const refused = await decide(shipment.id, 'REVISAO', true);
    expect(refused.refusalReason).toBe('Quantidade divergente'); expect(await balance()).toBe(0);
    expect(await db.getRepository(MovementEntity).count()).toBe(0);
    const correction = await incoming('EXPEDICAO'); expect(correction.id).not.toBe(shipment.id);
    expect((await service.get(shipment.id, users.EXPEDICAO)).status).toBe('RECUSADO');
    await expect(decide(shipment.id, 'REVISAO')).rejects.toBeInstanceOf(ConflictException);
  });
  it('autor cancela antes do recebimento, preserva histórico e restaura eventual reserva', async () => {
    const incomingShipment = await incoming();
    await expect(service.cancel(incomingShipment.id, 'Não sou o autor', users.REVISAO, metadata())).rejects.toBeInstanceOf(ForbiddenException);
    const canceledIncoming = await service.cancel(incomingShipment.id, 'Carga não será mais enviada', users.PRODUCAO, metadata());
    expect(canceledIncoming).toMatchObject({ status: 'CANCELADO', decidedById: users.PRODUCAO.id, refusalReason: 'Carga não será mais enviada' });
    expect(await balance()).toBe(0);
    expect(await db.getRepository(MovementEntity).countBy({ shipmentId: incomingShipment.id })).toBe(0);
    await expect(service.cancel(incomingShipment.id, 'Novo cancelamento', users.PRODUCAO, metadata())).rejects.toBeInstanceOf(ConflictException);
    await expect(decide(incomingShipment.id, 'REVISAO')).rejects.toBeInstanceOf(ConflictException);

    await seed();
    const outbound = await reserve('EXPEDICAO', 6);
    expect(await balance()).toBe(4);
    await service.cancel(outbound.id, 'Pedido retirado pelo remetente', users.REVISAO, metadata());
    expect(await balance()).toBe(10);
    const cancelAudit = await db.getRepository(AuditLogEntity).findOneByOrFail({ entityId: outbound.id, action: 'SHIPMENT_CANCEL' });
    expect(cancelAudit.newValues).toMatchObject({ cancellationReason: 'Pedido retirado pelo remetente', previousStatus: 'AGUARDANDO_RECEBIMENTO' });
    const administrator = { ...users.REVISAO, roles: ['ADMIN'] };
    expect((await service.auditHistory(outbound.id, administrator)).some((event) => event.action === 'SHIPMENT_CANCEL')).toBe(true);
    await expect(service.auditHistory(outbound.id, users.REVISAO)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('serializa cancelamento e recebimento concorrentes sem efeito duplo', async () => {
    await seed();
    const shipment = await reserve('PRODUCAO', 6);
    const outcomes = await Promise.allSettled([
      service.cancel(shipment.id, 'Cancelado durante conferência', users.REVISAO, metadata()),
      decide(shipment.id, 'PRODUCAO'),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const persisted = await service.get(shipment.id, users.REVISAO);
    expect(['CANCELADO', 'CONFIRMADO']).toContain(persisted.status);
    expect(await balance()).toBe(persisted.status === 'CANCELADO' ? 10 : 4);
    expect(await db.getRepository(MovementEntity).countBy({ shipmentId: shipment.id })).toBe(persisted.status === 'CONFIRMADO' ? 1 : 0);
  });
  it('Revisão → Produção: reserva e confirmação sem dupla baixa', async () => {
    await seed(); const shipment = await reserve(); expect(await balance()).toBe(4);
    expect(await db.getRepository(MovementEntity).count()).toBe(0);
    await decide(shipment.id, 'PRODUCAO'); expect(await balance()).toBe(4);
    await decide(shipment.id, 'PRODUCAO'); expect(await balance()).toBe(4);
    expect(await db.getRepository(MovementEntity).countBy({ shipmentId: shipment.id })).toBe(1);
  });
  it('Revisão → Expedição: recusa devolve reserva exata inclusive com produto inativado', async () => {
    await seed(); const shipment = await reserve('EXPEDICAO'); expect(await balance()).toBe(4);
    await db.query('UPDATE products SET active = false WHERE id = $1', [productId]);
    await decide(shipment.id, 'EXPEDICAO', true); expect(await balance()).toBe(10);
    await decide(shipment.id, 'EXPEDICAO', true); expect(await balance()).toBe(10);
  });
  it('impede decisão/leitura de outro setor e ignora tentativa de escolher origem', async () => {
    const shipment = await incoming();
    await expect(decide(shipment.id, 'EXPEDICAO')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.get(shipment.id, users.EXPEDICAO)).rejects.toBeInstanceOf(NotFoundException);
    await expect(createShipment({ requestKey: randomUUID(), destinationSector: 'EXPEDICAO', items: [{ productId, batchId, quantity: 1 }] }, users.PRODUCAO, metadata())).rejects.toBeInstanceOf(BadRequestException);
    expect((await service.list({ view: 'pending', page: 1, limit: 10 }, users.EXPEDICAO)).meta.total).toBe(0);
  });
  it('confirmações concorrentes efetivam uma única entrada', async () => {
    const shipment = await incoming();
    await Promise.all([decide(shipment.id,'REVISAO'), decide(shipment.id,'REVISAO')]);
    expect(await balance()).toBe(10); expect(await db.getRepository(MovementEntity).count()).toBe(1);
  });
  it('reservas concorrentes e consumo interno não usam saldo em trânsito', async () => {
    await seed();
    const results = await Promise.allSettled([reserve(), reserve()]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1); expect(await balance()).toBe(4);
    await expect(db.transaction((manager) => stock.distributeQuantity({ productId, batchId, stockLocationId: sourceId }, [{ destinationLocationId: tufId, quantity: 5 }], 5, manager))).rejects.toBeInstanceOf(ConflictException);
    expect(await balance()).toBe(4); expect(await balance(tufId)).toBe(0);
  });
  it('consulta posições por lote/fabricação com Lata Boa primeiro e somente para Revisão', async () => {
    await seed(8, sourceId);
    await seed(12, lataBoaId);
    await seed(5, tufId);
    const byLot = await service.availablePositions({ productId, batchCode: 'SOC', page: 1, limit: 10 }, users.REVISAO);
    expect(byLot.items.map((item) => item.stockLocation.code)).toEqual(['LATA_BOA', 'REVISAR', 'TUF']);
    expect(byLot.meta.total).toBe(3);
    const byDate = await service.availablePositions({ productId, manufacturingDate: '2026-08-31', page: 1, limit: 2 }, users.REVISAO);
    expect(byDate.items[0].stockLocation.code).toBe('LATA_BOA');
    expect(byDate.meta.totalPages).toBe(2);
    await expect(service.availablePositions({ productId, page: 1, limit: 10 }, users.REVISAO)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.availablePositions({ productId, batchCode: 'SOC', page: 1, limit: 10 }, users.PRODUCAO)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('reenvio da criação não reserva novamente', async () => {
    await seed(); const key = randomUUID();
    const [a,b] = await Promise.all([reserve('PRODUCAO',6,key),reserve('PRODUCAO',6,key)]);
    expect(a.id).toBe(b.id); expect(await balance()).toBe(4);
  });
  it('falha da auditoria reverte criação, reserva, confirmação e recusa integralmente', async () => {
    await seed();
    const spy = jest.spyOn(audit,'record').mockRejectedValueOnce(new Error('audit failed'));
    await expect(reserve()).rejects.toThrow('audit failed'); expect(await balance()).toBe(10);
    expect(await db.getRepository(ShipmentEntity).count()).toBe(0);
    const outbound = await reserve('EXPEDICAO');
    spy.mockRejectedValueOnce(new Error('audit failed'));
    await expect(decide(outbound.id,'EXPEDICAO',true)).rejects.toThrow('audit failed');
    expect(await balance()).toBe(4); expect((await service.get(outbound.id,users.REVISAO)).status).toBe('AGUARDANDO_RECEBIMENTO');
    spy.mockRejectedValueOnce(new Error('audit failed'));
    await expect(service.cancel(outbound.id, 'Cancelamento com auditoria indisponível', users.REVISAO, metadata())).rejects.toThrow('audit failed');
    expect(await balance()).toBe(4); expect((await service.get(outbound.id,users.REVISAO)).status).toBe('AGUARDANDO_RECEBIMENTO');
    const inbound = await incoming();
    spy.mockRejectedValueOnce(new Error('audit failed'));
    await expect(decide(inbound.id,'REVISAO')).rejects.toThrow('audit failed');
    expect(await balance()).toBe(4); expect(await db.getRepository(MovementEntity).count()).toBe(0);
  });
  it('recusa restaura múltiplos locais e confirmação vincula movimentos por origem', async () => {
    await seed(10); await seed(20,tufId);
    const create = (): Promise<ShipmentEntity> => createShipment({ requestKey: randomUUID(), destinationSector: 'EXPEDICAO', items: [
      { productId,batchId,stockLocationId: sourceId,quantity: 3 }, { productId,batchId,stockLocationId: tufId,quantity: 8 },
    ] },users.REVISAO,metadata());
    const a = await create(); expect(await balance()).toBe(7); expect(await balance(tufId)).toBe(12);
    await decide(a.id,'EXPEDICAO',true); expect(await balance()).toBe(10); expect(await balance(tufId)).toBe(20);
    const b = await create(); await decide(b.id,'EXPEDICAO');
    expect(await balance()).toBe(7); expect(await balance(tufId)).toBe(12);
    expect(await db.getRepository(MovementEntity).countBy({ shipmentId: b.id })).toBe(2);
    expect(b.items.map((item) => item.codigoRegistro)).toEqual([`${b.codigoMovimentacao}-A`, `${b.codigoMovimentacao}-B`]);
    const linked = await db.query<Array<{ code: string; source_code: string }>>(`SELECT item.codigo_registro AS code,
      source.codigo_registro AS source_code FROM movement_items item
      JOIN shipment_items source ON source.id = item.shipment_item_id
      JOIN movements movement ON movement.id = item.movement_id WHERE movement.shipment_id=$1`, [b.id]);
    expect(linked).toHaveLength(2);
    expect(linked.every((item) => item.code === item.source_code)).toBe(true);
  });
  it('reverte reservas anteriores quando outro item não tem saldo', async () => {
    await seed();
    await expect(createShipment({requestKey:randomUUID(),destinationSector:'PRODUCAO',items:[
      {productId,batchId,stockLocationId:sourceId,quantity:3}, {productId,batchId,stockLocationId:tufId,quantity:5},
    ]},users.REVISAO,metadata())).rejects.toBeInstanceOf(ConflictException);
    expect(await balance()).toBe(10); expect(await db.getRepository(ShipmentEntity).count()).toBe(0);
  });
  it('protege o tipo da posição em trânsito para garantir restauração após recusa', async () => {
    const locations = new StockLocationsService(new StockLocationsRepository(db.getRepository(StockLocationEntity)),audit,db);
    const location = await locations.create({code:'SHIP-SOURCE',name:'Origem extra',kind:StockLocationKind.Stock},users.REVISAO.id,metadata());
    await seed(10,location.id);
    const shipment = await createShipment({requestKey:randomUUID(),destinationSector:'PRODUCAO',items:[{productId,batchId,stockLocationId:location.id,quantity:10}]},users.REVISAO,metadata());
    await expect(locations.update(location.id,{kind:StockLocationKind.External},users.REVISAO.id,metadata())).rejects.toBeInstanceOf(ConflictException);
    await decide(shipment.id,'PRODUCAO',true); expect(await balance(location.id)).toBe(10);
  });
  it('reutiliza lote CONSERVADI e exige confirmação de validade divergente', async () => {
    const dto = { requestKey: randomUUID(), destinationSector: 'REVISAO' as const, items: [{ productId, lot: { manufacturingDate: '2026-08-31', expirationDate: '2029-08-31' }, quantity: 7 }] };
    await expect(createShipment(dto,users.PRODUCAO,metadata())).rejects.toBeInstanceOf(ConflictException);
    expect(await db.getRepository(ShipmentEntity).count()).toBe(0);
    const shipment = await createShipment({ ...dto, confirmedExpirationKeys: [`${productId}:SOCDNV:2028-08-31`] },users.PRODUCAO,metadata());
    expect(shipment.items[0].batch.code).toBe('SOCDNV'); expect(await balance()).toBe(0);
    await expect(decide(shipment.id,'REVISAO')).rejects.toBeInstanceOf(ConflictException);
    await service.decide(shipment.id,'CONFIRMADO',null,{ confirmedExpirationKeys: [`${productId}:SOCDNV:2028-08-31`] },users.REVISAO,metadata());
    expect(await stock.getBalance({ productId,batchId:shipment.items[0].batchId,stockLocationId:sourceId })).toBe(7);
  });
  it('preserva snapshot e protege registros contra edição/exclusão e cancelamento isolado', async () => {
    // Use inline date unique to this test so prior variants need no implicit acceptance.
    const shipment = await createShipment({ requestKey: randomUUID(), destinationSector: 'REVISAO', items: [{ productId, lot: { manufacturingDate: '2026-09-14', expirationDate: '2028-09-14' }, quantity: 2 }] }, users.PRODUCAO,metadata());
    await db.query("UPDATE products SET name = 'Nome alterado' WHERE id = $1",[productId]);
    await decide(shipment.id,'REVISAO');
    const movement = await db.getRepository(MovementEntity).findOneByOrFail({ shipmentId:shipment.id });
    expect((await movements.getById(movement.id)).items[0].productSnapshot?.name).toBe('Produto do envio');
    await expect(movements.cancel(movement.id,{reason:'teste'},users.REVISAO.id,metadata())).rejects.toBeInstanceOf(ConflictException);
    await expect(db.getRepository(ShipmentEntity).delete(shipment.id)).rejects.toThrow();
    await expect(db.getRepository(ShipmentItemEntity).update(shipment.items[0].id,{quantity:99})).rejects.toThrow();
    const runner = db.createQueryRunner();
    await runner.connect(); await runner.startTransaction();
    try { await expect(new ShipmentObservations1789430400000().down(runner)).rejects.toThrow('rollback destrutivo'); }
    finally { await runner.rollbackTransaction(); await runner.release(); }
  });
  it('lista envios paginados e preserva a entrada manual permitida de Produção', async () => {
    const external = await db.getRepository(StockLocationEntity).findOneByOrFail({sector:'PRODUCAO'});
    await expect(movements.createExternalEntry({requestKey:randomUUID(),originLocationId:external.id,destinationLocationId:sourceId,items:[{productId,batchId,quantity:1}]},users.REVISAO.id,metadata())).resolves.toMatchObject({type:'ENTRADA_EXTERNA',originLocationId:external.id,destinationLocationId:sourceId});
    for (let i = 0; i < 3; i++) await createShipment({requestKey:randomUUID(),destinationSector:'REVISAO',items:[{productId,lot:{manufacturingDate:'2026-09-14',expirationDate:'2028-09-14'},quantity:i+1}]},users.PRODUCAO,metadata());
    const first = await service.list({view:'pending',page:1,limit:2},users.REVISAO);
    const second = await service.list({view:'pending',page:2,limit:2},users.REVISAO);
    expect(first.meta.total).toBe(3); expect(second.items).toHaveLength(1);
    expect(first.items.map((item) => item.id)).not.toContain(second.items[0].id);
  });
  const admin = (): AuthenticatedUser => ({ ...users.REVISAO, roles: ['ADMIN'] });
  it('admin cancela entrada aceita preservando original, recebimento e auditoria', async () => {
    const shipment = await incoming(); await decide(shipment.id, 'REVISAO');
    const original = await service.get(shipment.id, users.REVISAO);
    const canceled = await service.administrativeCancel(shipment.id, 'Teste de correção', admin(), metadata());
    expect(await balance()).toBe(0);
    expect(canceled).toMatchObject({ status: 'CANCELADO', canceledById: admin().id, cancellationReason: 'Teste de correção', decidedById: original.decidedById, decidedAt: original.decidedAt, refusalReason: null });
    expect(canceled.items[0].quantity).toBe(10);
    expect(await db.getRepository(MovementEntity).findOneBy({ shipmentId: shipment.id })).toMatchObject({ status: 'CANCELADA', cancellationReason: 'Teste de correção' });
    expect(await db.getRepository(AuditLogEntity).countBy({ action: 'SHIPMENT_ADMIN_CANCEL', entityId: shipment.id })).toBe(1);
    const history = await new HistoryService(db).list(new HistoryQueryDto(), admin());
    expect(history.items).toHaveLength(1); expect(history.items[0]).toMatchObject({ groupId: shipment.id, receivedBy: 'REVISAO', status: 'CANCELADO' });
    await expect(service.administrativeCancel(shipment.id, 'Repetido', admin(), metadata())).rejects.toBeInstanceOf(ConflictException);
    await expect(db.getRepository(ShipmentEntity).delete(shipment.id)).rejects.toThrow();
  });
  it('admin corrige quantidade em nova solicitação vinculada, com retry idempotente', async () => {
    await seed(); const shipment = await reserve(); await decide(shipment.id, 'PRODUCAO');
    const dto = { requestKey: randomUUID(), reason: 'Quantidade correta', items: [{ shipmentItemId: shipment.items[0].id, quantity: 8, observation: 'Conferir' }] };
    const corrected = await service.correct(shipment.id, dto, admin(), metadata());
    expect(corrected).toMatchObject({ correctedFromId: shipment.id, status: 'AGUARDANDO_RECEBIMENTO', items: [{ quantity: 8, observation: 'Conferir' }] });
    expect(corrected.codigoMovimentacao).not.toBe(shipment.codigoMovimentacao);
    expect(await balance()).toBe(2);
    expect((await service.correct(shipment.id, dto, admin(), metadata())).id).toBe(corrected.id);
    expect(await balance()).toBe(2); expect(await db.getRepository(ShipmentEntity).count()).toBe(2);
  });
  it('cancelamento administrativo pendente não inventa um recebimento', async () => {
    const shipment = await incoming();
    const canceled = await service.administrativeCancel(shipment.id, 'Não enviado', admin(), metadata());
    expect(canceled).toMatchObject({ status: 'CANCELADO', decidedById: null, decidedAt: null, refusalReason: null, canceledById: admin().id });
    expect(await balance()).toBe(0);
  });
  it('falha na nova reserva faz rollback do cancelamento, saldo, histórico e auditoria', async () => {
    await seed(); const shipment = await reserve(); await decide(shipment.id, 'PRODUCAO');
    const count = await db.getRepository(AuditLogEntity).count();
    await expect(service.correct(shipment.id, { requestKey: randomUUID(), reason: 'Maior', items: [{ shipmentItemId: shipment.items[0].id, quantity: 11 }] }, admin(), metadata())).rejects.toThrow();
    expect(await balance()).toBe(4); expect((await service.get(shipment.id, users.REVISAO)).status).toBe('CONFIRMADO');
    expect(await db.getRepository(AuditLogEntity).count()).toBe(count); expect(await db.getRepository(ShipmentEntity).count()).toBe(1);
    expect(await db.getRepository(MovementEntity).findOneBy({ shipmentId: shipment.id })).toMatchObject({ status: 'EFETIVADA' });
  });
  it('bloqueia saldo consumido, operador sem administração e admin de outro setor', async () => {
    const shipment = await incoming('EXPEDICAO'); await decide(shipment.id, 'REVISAO');
    await db.transaction((manager) => stock.removeQuantity({ productId, batchId, stockLocationId: sourceId }, 1, manager));
    await expect(service.administrativeCancel(shipment.id, 'Consumido', admin(), metadata())).rejects.toThrow();
    await expect(service.administrativeCancel(shipment.id, 'Sem acesso', users.REVISAO, metadata())).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.administrativeCancel(shipment.id, 'Outro setor', { ...users.PRODUCAO, roles: ['ADMIN_PRODUCAO_PCP'] }, metadata())).rejects.toBeInstanceOf(ForbiddenException);
    expect(await balance()).toBe(9); expect((await service.get(shipment.id, users.REVISAO)).status).toBe('CONFIRMADO');
  });
  it('estorna montagem aceita para todos os lotes/locais exatos em UN', async () => {
    await seed(12); await seed(8, lataBoaId);
    const shipment = await assembly(2, [{ batchId, stockLocationId: sourceId, quantity: 12 }, { batchId, stockLocationId: lataBoaId, quantity: 8 }]);
    await decide(shipment.id, 'EXPEDICAO'); await service.administrativeCancel(shipment.id, 'Montagem incorreta', admin(), metadata());
    expect(await balance()).toBe(12); expect(await balance(lataBoaId)).toBe(8);
  });
  it('cancela entrada líquida e retorno derivado juntos sem saldo fictício', async () => {
    const shipment = await incoming('EXPEDICAO');
    await service.decide(shipment.id, 'CONFIRMADO', null, { immediateSeparation: true }, users.REVISAO, metadata());
    await service.completeSeparation(shipment.id, { items: [{ shipmentItemId: shipment.items[0].id, returnQuantity: 3 }] }, [image()], users.REVISAO, metadata());
    const returned = await db.getRepository(ShipmentEntity).findOneByOrFail({ sourceShipmentId: shipment.id });
    await decide(returned.id, 'EXPEDICAO');
    await service.administrativeCancel(returned.id, 'Cancelar recebimento completo', admin(), metadata());
    expect(await balance()).toBe(0);
    expect((await db.getRepository(ShipmentEntity).findBy({ id: In([shipment.id, returned.id]) })).every((item) => item.status === 'CANCELADO')).toBe(true);
    expect((await db.getRepository(MovementEntity).find()).every((item) => item.status === MovementStatus.Canceled)).toBe(true);
  });
  it('bloqueia execução parcial mesmo com grupo ainda pendente', async () => {
    const shipment = await createShipment({ requestKey: randomUUID(), destinationSector: 'REVISAO', items: [{ productId, batchId, quantity: 10 }, { productId, batchId, quantity: 5 }] }, users.PRODUCAO, metadata());
    await decide(shipment.id, 'REVISAO');
    const movement = await db.getRepository(MovementEntity).findOneOrFail({ where: { shipmentId: shipment.id }, relations: { items: true } });
    const pcp = new PcpMovementsService(new PcpMovementsRepository(db.getRepository(MovementEntity), db.getRepository(MovementItemEntity), db.getRepository(AuditLogEntity), db.getRepository(ShipmentItemEntity), db.getRepository(ShipmentEntity)), new MovementsRepository(db.getRepository(MovementEntity)), db, audit);
    await pcp.executeRecord(movement.items[0].id, {}, admin().id, metadata());
    expect((await db.getRepository(MovementEntity).findOneByOrFail({ id: movement.id })).pcpExecutionStatus).toBe('PENDENTE');
    await expect(service.administrativeCancel(shipment.id, 'Parcial', admin(), metadata())).rejects.toBeInstanceOf(ConflictException);
    expect(await balance()).toBe(15);
  });
  it('serializa disputa entre PCP e cancelamento', async () => {
    const shipment = await incoming(); await decide(shipment.id, 'REVISAO');
    const movement = await db.getRepository(MovementEntity).findOneOrFail({ where: { shipmentId: shipment.id }, relations: { items: true } });
    const pcp = new PcpMovementsService(new PcpMovementsRepository(db.getRepository(MovementEntity), db.getRepository(MovementItemEntity), db.getRepository(AuditLogEntity), db.getRepository(ShipmentItemEntity), db.getRepository(ShipmentEntity)), new MovementsRepository(db.getRepository(MovementEntity)), db, audit);
    const results = await Promise.allSettled([pcp.executeRecord(movement.items[0].id, {}, admin().id, metadata()), service.administrativeCancel(shipment.id, 'Disputa', admin(), metadata())]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const current = await db.getRepository(MovementEntity).findOneByOrFail({ id: movement.id });
    expect(await balance()).toBe(current.status === MovementStatus.Canceled ? 0 : 10);
    if (current.status === MovementStatus.Effective) await expect(service.administrativeCancel(shipment.id, 'Depois do PCP', admin(), metadata())).rejects.toBeInstanceOf(ConflictException);
  });
  it('unifica o histórico sem duplicar envio confirmado e só finaliza após PCP', async () => {
    const history = new HistoryService(db);
    const review = { ...users.REVISAO, permissions: [...users.REVISAO.permissions, 'movements.read'] };
    const query = { page: 1, limit: 20, view: 'GROUP' as const, scope: 'ALL' as const, kind: 'ALL' as const, direction: 'ALL' as const, sort: 'RECENT' as const, type: 'ALL' as const };
    const shipment = await incoming();
    expect((await history.list(query, review)).items).toEqual(expect.arrayContaining([expect.objectContaining({ id: shipment.id, scope: 'OPEN' })]));
    expect((await history.list(query, users.EXPEDICAO)).items).toHaveLength(0);
    await decide(shipment.id, 'REVISAO');
    const pending = await history.list({ ...query, scope: 'PENDING_PCP' }, review);
    expect(pending.items).toHaveLength(1);
    expect(pending.items[0].id).toBe(shipment.id);
    expect((await history.list({ ...query, scope: 'DONE' }, review)).items).toHaveLength(0);
    await db.query("UPDATE movements SET pcp_execution_status = 'EXECUTADA', pcp_executed_at = NOW(), pcp_executed_by_user_id = $1 WHERE shipment_id = $2", [users.REVISAO.id, shipment.id]);
    const done = await history.list({ ...query, scope: 'DONE' }, review);
    expect(done.items).toHaveLength(1);
    expect(done.items[0].id).toBe(shipment.id);
    expect((await history.list({ ...query, scope: 'DONE', limit: 1, page: 2 }, review)).meta.total).toBe(1);
  });
});
