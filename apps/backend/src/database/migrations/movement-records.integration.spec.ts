import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { databaseEntities, databaseMigrations } from '../typeorm.config';
import { MovementRecords1790726400000 } from './1790726400000-movement-records';

const databaseUrl = process.env.TEST_DATABASE_URL;
(databaseUrl ? describe : describe.skip)('Backfill de registros de movimentação (PostgreSQL)', () => {
  let db: DataSource;
  const userId = randomUUID();
  const productId = randomUUID();
  const batchId = randomUUID();
  const originId = randomUUID();
  const destinationId = randomUUID();
  const movementId = randomUUID();
  const shipmentId = randomUUID();
  const shipmentMovementId = randomUUID();

  beforeAll(async () => {
    if (!new URL(databaseUrl!).pathname.endsWith('_test')) throw new Error('Exige banco descartavel _test.');
    db = new DataSource({ type: 'postgres', url: databaseUrl, entities: databaseEntities,
      migrations: databaseMigrations.filter((migration) => migration !== MovementRecords1790726400000),
      migrationsTableName: 'schema_migrations', dropSchema: true, migrationsRun: true, synchronize: false });
    await db.initialize();
    await db.query("INSERT INTO users(id,username,password_hash) VALUES ($1,'records-backfill','$argon2id$test')", [userId]);
    await db.query("INSERT INTO products(id,code,name,default_unit,created_by,updated_by) VALUES ($1,'800003','Produto legado','UN',$2,$2)", [productId, userId]);
    await db.query("INSERT INTO batches(id,product_id,code,manufacturing_date,expiration_date,created_by,updated_by) VALUES ($1,$2,'SOCDNV','2026-01-01','2028-01-01',$3,$3)", [batchId, productId, userId]);
    await db.query("INSERT INTO stock_locations(id,code,name,kind,created_by,updated_by) VALUES ($1,'BACKFILL_ORIGIN','Origem','EXTERNAL',$3,$3),($2,'BACKFILL_DEST','Destino','STOCK',$3,$3)", [originId, destinationId, userId]);
    await db.query(`INSERT INTO movements(id,request_key,type,origin_location_id,destination_location_id,responsible_user_id,occurred_at,status,
      pcp_execution_status,pcp_executed_by_user_id,pcp_executed_at)
      VALUES ($1,$2,'ENTRADA_EXTERNA',$3,$4,$5,'2026-09-01','EFETIVADA','EXECUTADA',$5,'2026-09-02')`,
    [movementId, randomUUID(), originId, destinationId, userId]);
    for (let index = 0; index < 27; index += 1) await db.query(`INSERT INTO movement_items(id,movement_id,product_id,batch_id,quantity)
      VALUES ($1,$2,$3,$4,$5)`, [randomUUID(), movementId, productId, batchId, index + 1]);
    await db.query(`INSERT INTO shipments(id,request_key,origin_sector,destination_sector,created_by_id,origin_location_id,destination_location_id,
      status,decided_by_id,decided_at) VALUES ($1,$2,'EXPEDICAO','REVISAO',$3,$4,$5,'CONFIRMADO',$3,'2026-09-03')`,
    [shipmentId, randomUUID(), userId, originId, destinationId]);
    for (const quantity of [10, 20, 30]) await db.query(`INSERT INTO shipment_items(id,shipment_id,product_id,batch_id,quantity,product_snapshot)
      VALUES ($1,$2,$3,$4,$5,$6)`, [randomUUID(), shipmentId, productId, batchId, quantity,
      { code: '800003', name: 'Produto legado', defaultUnit: 'UN' }]);
    await db.query(`INSERT INTO movements(id,request_key,type,origin_location_id,destination_location_id,responsible_user_id,occurred_at,status,shipment_id)
      VALUES ($1,$2,'ENTRADA_EXTERNA',$3,$4,$5,'2026-09-03','EFETIVADA',$6)`,
    [shipmentMovementId, randomUUID(), originId, destinationId, userId, shipmentId]);
    for (const quantity of [10, 20, 30]) await db.query(`INSERT INTO movement_items(id,movement_id,product_id,batch_id,quantity)
      VALUES ($1,$2,$3,$4,$5)`, [randomUUID(), shipmentMovementId, productId, batchId, quantity]);
    await db.query(`INSERT INTO movement_items(id,movement_id,product_id,batch_id,quantity)
      VALUES ($1,$2,$3,$4,1)`, [randomUUID(), shipmentMovementId, productId, batchId]);
    const runner = db.createQueryRunner();
    await runner.startTransaction();
    try { await new MovementRecords1790726400000().up(runner); await runner.commitTransaction(); }
    catch (error) { await runner.rollbackTransaction(); throw error; }
    finally { await runner.release(); }
  });
  afterAll(async () => { if (db?.isInitialized) await db.destroy(); });

  it('preserva dados e preenche A até AA, status e vínculo do envio', async () => {
    const direct = await db.query<Array<{ codigo_registro: string; quantity: string; pcp_execution_status: string }>>(
      'SELECT codigo_registro, quantity, pcp_execution_status FROM movement_items WHERE movement_id=$1 ORDER BY record_ordinal', [movementId]);
    const groupCode = (await db.query<Array<{ codigo_movimentacao: string }>>('SELECT codigo_movimentacao FROM movements WHERE id=$1', [movementId]))[0].codigo_movimentacao;
    expect(direct).toHaveLength(27);
    expect(direct[0].codigo_registro).toBe(`${groupCode}-A`);
    expect(direct[25].codigo_registro).toBe(`${groupCode}-Z`);
    expect(direct[26].codigo_registro).toBe(`${groupCode}-AA`);
    expect(direct.every((row) => row.pcp_execution_status === 'EXECUTADA')).toBe(true);
    expect(direct.map((row) => Number(row.quantity)).sort((a, b) => a - b)).toEqual(Array.from({ length: 27 }, (_, index) => index + 1));
    const linked = await db.query<Array<{ code: string; source_code: string; quantity: string }>>(`
      SELECT item.codigo_registro AS code, source.codigo_registro AS source_code, item.quantity
      FROM movement_items item JOIN shipment_items source ON source.id = item.shipment_item_id
      WHERE item.movement_id=$1 ORDER BY item.quantity`, [shipmentMovementId]);
    expect(linked).toHaveLength(3);
    expect(linked.every((row) => row.code === row.source_code)).toBe(true);
    expect(linked.map((row) => Number(row.quantity))).toEqual([10, 20, 30]);
    const unmatched = await db.query<Array<{ codigo_registro: string; shipment_item_id: string | null }>>(
      'SELECT codigo_registro, shipment_item_id FROM movement_items WHERE movement_id=$1 AND quantity=1', [shipmentMovementId]);
    expect(unmatched).toHaveLength(1);
    expect(unmatched[0].shipment_item_id).toBeNull();
    expect(linked.map((row) => row.code)).not.toContain(unmatched[0].codigo_registro);
  });

  it('gera A até AA também para um grupo novo e rejeita duplicação', async () => {
    const id = randomUUID();
    await db.query(`INSERT INTO movements(id,request_key,type,origin_location_id,destination_location_id,responsible_user_id,occurred_at,status)
      VALUES ($1,$2,'ENTRADA_EXTERNA',$3,$4,$5,'2026-09-04','EFETIVADA')`,
    [id, randomUUID(), originId, destinationId, userId]);
    for (let index = 0; index < 27; index += 1) await db.query(`INSERT INTO movement_items(id,movement_id,product_id,batch_id,quantity)
      VALUES ($1,$2,$3,$4,1)`, [randomUUID(), id, productId, batchId]);
    const codes = await db.query<Array<{ codigo_registro: string }>>(
      'SELECT codigo_registro FROM movement_items WHERE movement_id=$1 ORDER BY record_ordinal', [id]);
    const groupCode = (await db.query<Array<{ codigo_movimentacao: string }>>(
      'SELECT codigo_movimentacao FROM movements WHERE id=$1', [id]))[0].codigo_movimentacao;
    expect(codes[0].codigo_registro).toBe(`${groupCode}-A`);
    expect(codes[26].codigo_registro).toBe(`${groupCode}-AA`);
    expect(new Set(codes.map((row) => row.codigo_registro)).size).toBe(27);
    await expect(db.query(`INSERT INTO movement_items(id,movement_id,product_id,batch_id,quantity,record_ordinal)
      VALUES ($1,$2,$3,$4,1,1)`, [randomUUID(), id, productId, batchId]))
      .rejects.toMatchObject({ code: '23505' });
  });
});
