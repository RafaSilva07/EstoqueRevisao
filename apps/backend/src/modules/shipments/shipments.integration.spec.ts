import { randomUUID } from 'node:crypto';
import { ShipmentObservations1789430400000 } from '../../database/migrations/1789430400000-shipment-observations';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { databaseEntities, databaseMigrations } from '../../database/typeorm.config';
import { AuditService } from '../audit/audit.service';
import { AuditRepository } from '../audit/audit.repository';
import { AuditLogEntity } from '../audit/entities/audit-log.entity';
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
import { MovementsRepository } from '../movements/movements.repository';
import { MovementsService } from '../movements/movements.service';
import { Sector, ShipmentEntity, ShipmentItemEntity } from './shipment.entity';
import { ShipmentsService } from './shipments.service';

const databaseUrl = process.env.TEST_DATABASE_URL;
(databaseUrl ? describe : describe.skip)('Envios entre setores (PostgreSQL)', () => {
  let db: DataSource; let service: ShipmentsService; let stock: StockPositionsService; let movements: MovementsService; let audit: AuditService;
  let users: Record<Sector, AuthenticatedUser>; let productId: string; let batchId: string; let sourceId: string; let tufId: string; let lataBoaId: string;
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
    service = new ShipmentsService(db, lots, stock, repository, audit);
    users = {} as Record<Sector, AuthenticatedUser>;
    for (const sector of ['REVISAO','PRODUCAO','EXPEDICAO'] as const) {
      const id = randomUUID();
      await db.query(`INSERT INTO users(id,username,password_hash,sector) VALUES ($1,$2,'$argon2id$test',$2)`, [id,sector]);
      users[sector] = { id, sector, username: sector, sessionId: randomUUID(), roles: [], permissions: ['shipments.read','shipments.create','shipments.decide'] };
    }
    productId = randomUUID(); batchId = randomUUID();
    await db.query(`INSERT INTO products(id,code,name,default_unit,shelf_life_years,created_by,updated_by) VALUES ($1,'SHIP-P','Produto do envio','UN',2,$2,$2)`, [productId,users.REVISAO.id]);
    await db.query(`INSERT INTO batches(id,product_id,code,manufacturing_date,expiration_date,created_by,updated_by) VALUES ($1,$2,'SOCDNV','2026-08-31','2028-08-31',$3,$3)`, [batchId,productId,users.REVISAO.id]);
    sourceId = (await db.getRepository(StockLocationEntity).findOneByOrFail({ code: 'REVISAR' })).id;
    tufId = (await db.getRepository(StockLocationEntity).findOneByOrFail({ code: 'TUF' })).id;
    lataBoaId = (await db.getRepository(StockLocationEntity).findOneByOrFail({ code: 'LATA_BOA' })).id;
  });
  beforeEach(async () => {
    jest.restoreAllMocks();
    await db.query('TRUNCATE audit_logs, movements, stock_positions, shipments CASCADE');
    await db.query('UPDATE products SET active = true WHERE id = $1', [productId]);
  });
  afterAll(async () => { if (db?.isInitialized) await db.destroy(); });
  const incoming = (sector: 'PRODUCAO' | 'EXPEDICAO' = 'PRODUCAO'): Promise<ShipmentEntity> => service.create({ requestKey: randomUUID(), destinationSector: 'REVISAO', items: [{ productId, batchId, quantity: 10 }] }, users[sector], metadata());
  const reserve = (destinationSector: 'PRODUCAO' | 'EXPEDICAO' = 'PRODUCAO', quantity = 6, requestKey = randomUUID()): Promise<ShipmentEntity> => service.create({ requestKey, destinationSector, items: [{ productId, batchId, stockLocationId: sourceId, quantity }] }, users.REVISAO, metadata());
  const balance = (location = sourceId): Promise<number> => stock.getBalance({ productId, batchId, stockLocationId: location });
  const seed = (quantity = 10, location = sourceId): Promise<StockPositionEntity> => db.transaction((manager) => stock.addQuantity({ productId, batchId, stockLocationId: location }, quantity, manager));
  const decide = (id: string, sector: Sector, refuse = false): Promise<ShipmentEntity> => service.decide(id, refuse ? 'RECUSADO' : 'CONFIRMADO', refuse ? 'Quantidade divergente' : null, {}, users[sector], metadata());

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
    expect(await db.getRepository(AuditLogEntity).countBy({ entityId: shipment.id })).toBe(2);
  });
  it('preserva observações do envio e de cada produto no histórico', async () => {
    const shipment = await service.create({
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
    await expect(service.create({ requestKey: randomUUID(), destinationSector: 'EXPEDICAO', items: [{ productId, batchId, quantity: 1 }] }, users.PRODUCAO, metadata())).rejects.toBeInstanceOf(BadRequestException);
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
    const inbound = await incoming();
    spy.mockRejectedValueOnce(new Error('audit failed'));
    await expect(decide(inbound.id,'REVISAO')).rejects.toThrow('audit failed');
    expect(await balance()).toBe(4); expect(await db.getRepository(MovementEntity).count()).toBe(0);
  });
  it('recusa restaura múltiplos locais e confirmação vincula movimentos por origem', async () => {
    await seed(10); await seed(20,tufId);
    const create = (): Promise<ShipmentEntity> => service.create({ requestKey: randomUUID(), destinationSector: 'EXPEDICAO', items: [
      { productId,batchId,stockLocationId: sourceId,quantity: 3 }, { productId,batchId,stockLocationId: tufId,quantity: 8 },
    ] },users.REVISAO,metadata());
    const a = await create(); expect(await balance()).toBe(7); expect(await balance(tufId)).toBe(12);
    await decide(a.id,'EXPEDICAO',true); expect(await balance()).toBe(10); expect(await balance(tufId)).toBe(20);
    const b = await create(); await decide(b.id,'EXPEDICAO');
    expect(await balance()).toBe(7); expect(await balance(tufId)).toBe(12);
    expect(await db.getRepository(MovementEntity).countBy({ shipmentId: b.id })).toBe(2);
  });
  it('reverte reservas anteriores quando outro item não tem saldo', async () => {
    await seed();
    await expect(service.create({requestKey:randomUUID(),destinationSector:'PRODUCAO',items:[
      {productId,batchId,stockLocationId:sourceId,quantity:3}, {productId,batchId,stockLocationId:tufId,quantity:5},
    ]},users.REVISAO,metadata())).rejects.toBeInstanceOf(ConflictException);
    expect(await balance()).toBe(10); expect(await db.getRepository(ShipmentEntity).count()).toBe(0);
  });
  it('protege o tipo da posição em trânsito para garantir restauração após recusa', async () => {
    const locations = new StockLocationsService(new StockLocationsRepository(db.getRepository(StockLocationEntity)),audit,db);
    const location = await locations.create({code:'SHIP-SOURCE',name:'Origem extra',kind:StockLocationKind.Stock},users.REVISAO.id,metadata());
    await seed(10,location.id);
    const shipment = await service.create({requestKey:randomUUID(),destinationSector:'PRODUCAO',items:[{productId,batchId,stockLocationId:location.id,quantity:10}]},users.REVISAO,metadata());
    await expect(locations.update(location.id,{kind:StockLocationKind.External},users.REVISAO.id,metadata())).rejects.toBeInstanceOf(ConflictException);
    await decide(shipment.id,'PRODUCAO',true); expect(await balance(location.id)).toBe(10);
  });
  it('reutiliza lote CONSERVADI e exige confirmação de validade divergente', async () => {
    const dto = { requestKey: randomUUID(), destinationSector: 'REVISAO' as const, items: [{ productId, lot: { manufacturingDate: '2026-08-31', expirationDate: '2029-08-31' }, quantity: 7 }] };
    await expect(service.create(dto,users.PRODUCAO,metadata())).rejects.toBeInstanceOf(ConflictException);
    expect(await db.getRepository(ShipmentEntity).count()).toBe(0);
    const shipment = await service.create({ ...dto, confirmedExpirationKeys: [`${productId}:SOCDNV:2028-08-31`] },users.PRODUCAO,metadata());
    expect(shipment.items[0].batch.code).toBe('SOCDNV'); expect(await balance()).toBe(0);
    await expect(decide(shipment.id,'REVISAO')).rejects.toBeInstanceOf(ConflictException);
    await service.decide(shipment.id,'CONFIRMADO',null,{ confirmedExpirationKeys: [`${productId}:SOCDNV:2028-08-31`] },users.REVISAO,metadata());
    expect(await stock.getBalance({ productId,batchId:shipment.items[0].batchId,stockLocationId:sourceId })).toBe(7);
  });
  it('preserva snapshot e protege registros contra edição/exclusão e cancelamento isolado', async () => {
    // Use inline date unique to this test so prior variants need no implicit acceptance.
    const shipment = await service.create({ requestKey: randomUUID(), destinationSector: 'REVISAO', items: [{ productId, lot: { manufacturingDate: '2026-09-14', expirationDate: '2028-09-14' }, quantity: 2 }] }, users.PRODUCAO,metadata());
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
  it('lista envios paginados e bloqueia rotas diretas dos setores', async () => {
    const external = await db.getRepository(StockLocationEntity).findOneByOrFail({sector:'PRODUCAO'});
    await expect(movements.createExternalEntry({requestKey:randomUUID(),originLocationId:external.id,destinationLocationId:sourceId,items:[{productId,batchId,quantity:1}]},users.REVISAO.id,metadata())).rejects.toBeInstanceOf(BadRequestException);
    for (let i = 0; i < 3; i++) await service.create({requestKey:randomUUID(),destinationSector:'REVISAO',items:[{productId,lot:{manufacturingDate:'2026-09-14',expirationDate:'2028-09-14'},quantity:1}]},users.PRODUCAO,metadata());
    const first = await service.list({view:'pending',page:1,limit:2},users.REVISAO);
    const second = await service.list({view:'pending',page:2,limit:2},users.REVISAO);
    expect(first.meta.total).toBe(3); expect(second.items).toHaveLength(1);
    expect(first.items.map((item) => item.id)).not.toContain(second.items[0].id);
  });
});
