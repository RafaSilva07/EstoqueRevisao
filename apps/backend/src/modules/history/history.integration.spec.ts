import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { databaseEntities, databaseMigrations } from '../../database/typeorm.config';
import { AuthenticatedUser } from '../auth/authenticated-user.interface';
import { HistoryQueryDto } from './history-query.dto';
import { HistoryService } from './history.service';

const databaseUrl = process.env.TEST_DATABASE_URL;
(databaseUrl ? describe : describe.skip)('Histórico por registro (PostgreSQL)', () => {
  let db: DataSource;
  let history: HistoryService;
  let groupCode: string;
  let shipmentCode: string;
  const userId = randomUUID();
  const productId = randomUUID();
  const batchId = randomUUID();
  const originId = randomUUID();
  const destinationId = randomUUID();
  const movementId = randomUUID();
  const shipmentId = randomUUID();
  const user = { id: userId, sector: 'REVISAO', permissions: ['movements.read', 'shipments.read'] } as AuthenticatedUser;
  const query = (overrides: Partial<HistoryQueryDto> = {}): HistoryQueryDto => ({
    page: 1, limit: 20, view: 'RECORD', scope: 'ALL', kind: 'ALL', direction: 'ALL',
    sort: 'RECENT', type: 'ALL', ...overrides,
  });

  beforeAll(async () => {
    if (!new URL(databaseUrl!).pathname.endsWith('_test')) throw new Error('Exige banco descartavel _test.');
    db = new DataSource({ type: 'postgres', url: databaseUrl, entities: databaseEntities,
      migrations: databaseMigrations, migrationsTableName: 'schema_migrations',
      dropSchema: true, migrationsRun: true, synchronize: false });
    await db.initialize();
    history = new HistoryService(db);
    await db.query("INSERT INTO users(id,username,password_hash) VALUES ($1,'history-records','$argon2id$test')", [userId]);
    await db.query("INSERT INTO products(id,code,name,default_unit,created_by,updated_by) VALUES ($1,'800002','Produto histórico','UN',$2,$2)", [productId, userId]);
    await db.query("INSERT INTO batches(id,product_id,code,manufacturing_date,expiration_date,created_by,updated_by) VALUES ($1,$2,'SOCDNV','2026-01-01','2028-01-01',$3,$3)", [batchId, productId, userId]);
    await db.query("INSERT INTO stock_locations(id,code,name,kind,created_by,updated_by) VALUES ($1,'HISTORY_ORIGIN','Expedição','EXTERNAL',$3,$3),($2,'HISTORY_DEST','Revisar','STOCK',$3,$3)", [originId, destinationId, userId]);
    await db.query(`INSERT INTO movements(id,request_key,type,origin_location_id,destination_location_id,responsible_user_id,occurred_at,status)
      VALUES ($1,$2,'ENTRADA_EXTERNA',$3,$4,$5,'2026-09-10','EFETIVADA')`, [movementId, randomUUID(), originId, destinationId, userId]);
    for (const quantity of [10, 20, 30]) await db.query(`INSERT INTO movement_items(id,movement_id,product_id,batch_id,quantity)
      VALUES ($1,$2,$3,$4,$5)`, [randomUUID(), movementId, productId, batchId, quantity]);
    groupCode = (await db.query<Array<{ codigo_movimentacao: string }>>('SELECT codigo_movimentacao FROM movements WHERE id=$1', [movementId]))[0].codigo_movimentacao;
    await db.query(`INSERT INTO shipments(id,request_key,origin_sector,destination_sector,created_by_id,origin_location_id,destination_location_id)
      VALUES ($1,$2,'EXPEDICAO','REVISAO',$3,$4,$5)`, [shipmentId, randomUUID(), userId, originId, destinationId]);
    for (const quantity of [4, 5]) await db.query(`INSERT INTO shipment_items(id,shipment_id,product_id,batch_id,quantity,product_snapshot)
      VALUES ($1,$2,$3,$4,$5,$6)`, [randomUUID(), shipmentId, productId, batchId, quantity,
      { code: '800002', name: 'Produto histórico', defaultUnit: 'UN' }]);
    shipmentCode = (await db.query<Array<{ codigo_movimentacao: string }>>('SELECT codigo_movimentacao FROM shipments WHERE id=$1', [shipmentId]))[0].codigo_movimentacao;
  });
  afterAll(async () => { if (db?.isInitialized) await db.destroy(); });

  it('pagina registros, mantém grupo e busca códigos pai/filho', async () => {
    const first = await history.list(query({ search: groupCode, limit: 2 }), user);
    expect(first.meta.total).toBe(3);
    expect(first.items.map((item) => item.code)).toEqual([`${groupCode}-C`, `${groupCode}-B`]);
    expect(first.items.every((item) => item.groupCode === groupCode && item.groupId === movementId)).toBe(true);
    expect(first.items[0]).toMatchObject({ manufacturingDate: '2026-01-01', sentBy: 'history-records',
      receivedBy: null, pcpExecutedBy: null, pcpRequired: true });
    const child = await history.list(query({ search: `${groupCode}-B` }), user);
    expect(child.meta.total).toBe(1);
    expect(child.items[0].quantity).toBe(20);
    const groups = await history.list(query({ view: 'GROUP', search: groupCode }), user);
    expect(groups.meta.total).toBe(1);
    expect(groups.items[0].code).toBe(groupCode);
    expect(groups.items[0].itemCount).toBe(3);
    expect((await history.list(query({ view: 'GROUP', search: `${groupCode}-B` }), user)).meta.total).toBe(1);
  });

  it('identifica registros de envio antes do recebimento e status PCP individual', async () => {
    const shipmentRecords = await history.list(query({ search: shipmentCode }), user);
    expect(shipmentRecords.items.map((item) => item.code)).toEqual([`${shipmentCode}-B`, `${shipmentCode}-A`]);
    expect(shipmentRecords.items.every((item) => item.scope === 'OPEN')).toBe(true);
    expect(shipmentRecords.items[0]).toMatchObject({ manufacturingDate: '2026-01-01',
      sentBy: 'history-records', receivedBy: null, pcpExecutedBy: null });
    await db.query(`UPDATE movement_items SET pcp_execution_status='EXECUTADA', pcp_executed_by_user_id=$1,
      pcp_executed_at=now() WHERE codigo_registro=$2`, [userId, `${groupCode}-A`]);
    const pending = await history.list(query({ scope: 'PENDING_PCP', search: groupCode }), user);
    expect(pending.meta.total).toBe(2);
    const done = await history.list(query({ scope: 'DONE', search: groupCode }), user);
    expect(done.meta.total).toBe(1);
    expect(done.items[0].code).toBe(`${groupCode}-A`);
    expect(done.items[0].pcpExecutedBy).toBe('history-records');
  });
});
