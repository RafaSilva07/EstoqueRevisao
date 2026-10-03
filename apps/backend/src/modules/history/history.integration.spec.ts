import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { databaseEntities, databaseMigrations } from '../../database/typeorm.config';
import { AuthenticatedUser } from '../auth/authenticated-user.interface';
import { HistoryQueryDto } from './history-query.dto';
import { HistoryService } from './history.service';
import { PcpMovementsRepository } from '../pcp/pcp-movements.repository';
import { MovementType } from '../movements/domain/movement-type.enum';
import { MovementEntity } from '../movements/entities/movement.entity';
import { MovementItemEntity } from '../movements/entities/movement-item.entity';
import { AuditLogEntity } from '../audit/entities/audit-log.entity';
import { ShipmentEntity, ShipmentItemEntity } from '../shipments/shipment.entity';

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

  it('consulta os destinos e quantidades gravados no item de revisão, inclusive no PCP', async () => {
    const reviewId = randomUUID();
    const itemId = randomUUID();
    await db.query(`INSERT INTO movements(id,request_key,type,origin_location_id,destination_location_id,responsible_user_id,occurred_at,status)
      VALUES ($1,$2,'REVISAO','10000000-0000-4000-8000-000000000002',NULL,$3,'2026-09-11','EFETIVADA')`,
    [reviewId, randomUUID(), userId]);
    await db.query('INSERT INTO movement_items(id,movement_id,product_id,batch_id,quantity) VALUES ($1,$2,$3,$4,60)',
      [itemId, reviewId, productId, batchId]);
    for (const [locationId, quantity] of [
      ['10000000-0000-4000-8000-000000000003', 30],
      ['10000000-0000-4000-8000-000000000004', 20],
      ['10000000-0000-4000-8000-000000000005', 10],
    ] as const) await db.query(`INSERT INTO movement_item_distributions(id,movement_item_id,destination_location_id,quantity)
      VALUES ($1,$2,$3,$4)`, [randomUUID(), itemId, locationId, quantity]);
    const code = (await db.query<Array<{ codigo_registro: string }>>('SELECT codigo_registro FROM movement_items WHERE id=$1', [itemId]))[0].codigo_registro;
    const result = await history.list(query({ search: code, type: 'REVISAO' }), user);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].reviewDistributionUnit).toBe('UN');
    expect(result.items[0].reviewDistributions).toEqual(expect.arrayContaining([
      { destinationCode: 'LATA_BOA', destination: 'Lata Boa', quantity: 30 },
      { destinationCode: 'VAREJO', destination: 'Varejo', quantity: 20 },
      { destinationCode: 'TUF', destination: 'TUF', quantity: 10 },
    ]));
    const pcp = new PcpMovementsRepository(db.getRepository(MovementEntity), db.getRepository(MovementItemEntity),
      db.getRepository(AuditLogEntity), db.getRepository(ShipmentItemEntity), db.getRepository(ShipmentEntity));
    const [pcpItems] = await pcp.findRecordsAndCount({ page: 1, limit: 20, sort: 'ASC', type: MovementType.Review, search: code });
    expect(pcpItems).toHaveLength(1);
    expect(pcpItems[0].reviewDistributionUnit).toBe('UN');
    expect(pcpItems[0].reviewDistributions).toEqual(expect.arrayContaining(result.items[0].reviewDistributions ?? []));
  });

  it('exporta só filhos finalizados, respeitando filtros e ordenação sem limitar à página', async () => {
    await db.query(`UPDATE movement_items SET pcp_execution_status='EXECUTADA', pcp_executed_by_user_id=$1,
      pcp_executed_at='2026-09-10T12:00:00Z' WHERE codigo_registro IN ($2,$3)`, [userId, `${groupCode}-A`, `${groupCode}-C`]);
    const csv = await history.exportCsv(query({ view: 'GROUP', search: groupCode, page: 7, limit: 1, sort: 'OLDEST',
      kind: 'MOVEMENT', direction: 'INCOMING', type: 'ENTRADA_EXTERNA', dateFrom: '2026-09-10T00:00:00Z', dateTo: '2026-09-10T23:59:59Z' }), user);
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(4); // Header, A, C and final newline.
    expect(lines[1]).toContain(`"${groupCode}-A"`);
    expect(lines[2]).toContain(`"${groupCode}-C"`);
    const cells = (line: string): string[] => [...line.matchAll(/"((?:[^"]|"")*)"/g)].map((match) => match[1]);
    const quantityColumn = cells(lines[0]).indexOf('Quantidade');
    expect(cells(lines[1])[quantityColumn]).toBe('10');
    expect(cells(lines[2])[quantityColumn]).toBe('30');
    expect(csv).not.toContain(`"${groupCode}-B"`);
    expect(csv).toContain('"2028-01-01"');
    expect((await history.exportCsv(query({ search: groupCode, direction: 'OUTGOING' }), user)).split('\r\n')).toHaveLength(2);
    expect((await history.exportCsv(query({ search: groupCode, dateFrom: '2026-09-11T00:00:00Z' }), user)).split('\r\n')).toHaveLength(2);
    expect((await history.exportCsv(query({ search: groupCode }), { ...user, sector: 'PRODUCAO', permissions: ['shipments.read'] })).split('\r\n')).toHaveLength(2);
    const pcpCsv = await history.exportCsv(query({ search: `${groupCode}-A` }), { ...user, sector: 'PCP', permissions: ['pcp.movements.read'] });
    expect(pcpCsv).toContain(`"${groupCode}-A"`);
  });

  it('omite recebimentos pendentes e canceladas, mas inclui retorno confirmado sem PCP', async () => {
    expect((await history.exportCsv(query({ search: shipmentCode }), user)).split('\r\n')).toHaveLength(2);
    const returnedId = randomUUID();
    const returnedItemId = randomUUID();
    await db.query(`INSERT INTO shipments(id,request_key,origin_sector,destination_sector,created_by_id,destination_location_id,
      status,decided_by_id,decided_at,shipment_kind,source_shipment_id)
      VALUES ($1,$2,'REVISAO','EXPEDICAO',$3,$4,'CONFIRMADO',$3,'2026-09-11T12:00:00Z','RETORNO_IMEDIATO',$5)`,
    [returnedId, randomUUID(), userId, originId, shipmentId]);
    await db.query(`INSERT INTO shipment_items(id,shipment_id,product_id,batch_id,stock_location_id,quantity,product_snapshot,observation)
      VALUES ($1,$2,$3,$4,$5,3,$6,'Conferido')`, [returnedItemId, returnedId, productId, batchId, destinationId,
      { code: '800002', name: 'Produto histórico', defaultUnit: 'UN' }]);
    const returnedCode = (await db.query<Array<{ codigo_movimentacao: string }>>('SELECT codigo_movimentacao FROM shipments WHERE id=$1', [returnedId]))[0].codigo_movimentacao;
    const returned = await history.exportCsv(query({ search: returnedCode, kind: 'SHIPMENT' }), user);
    expect(returned).toContain(`"${returnedCode}-A"`);
    expect(returned).toContain('"Não necessário"');
    expect(returned).toContain('"Conferido"');
    expect((await history.exportCsv(query({ search: returnedCode }), { ...user, sector: 'EXPEDICAO', permissions: ['shipments.read'] }))).toContain(returnedCode);
    expect((await history.exportCsv(query({ search: returnedCode }), { ...user, sector: 'PRODUCAO', permissions: ['shipments.read'] })).split('\r\n')).toHaveLength(2);
    const canceledId = randomUUID();
    await db.query(`INSERT INTO movements(id,request_key,type,origin_location_id,destination_location_id,responsible_user_id,
      occurred_at,status,canceled_by_user_id,canceled_at,cancellation_reason)
      VALUES ($1,$2,'ENTRADA_EXTERNA',$3,$4,$5,'2026-09-12','CANCELADA',$5,'2026-09-12','Teste de exclusão do CSV')`,
    [canceledId, randomUUID(), originId, destinationId, userId]);
    await db.query('INSERT INTO movement_items(id,movement_id,product_id,batch_id,quantity) VALUES ($1,$2,$3,$4,1)',
      [randomUUID(), canceledId, productId, batchId]);
    const canceledCode = (await db.query<Array<{ codigo_movimentacao: string }>>('SELECT codigo_movimentacao FROM movements WHERE id=$1', [canceledId]))[0].codigo_movimentacao;
    expect((await history.exportCsv(query({ search: canceledCode }), user)).split('\r\n')).toHaveLength(2);
  });

  it('mantém distribuição de revisão e lotes de transferência em uma linha por registro', async () => {
    const review = (await db.query<Array<{ id: string; codigo_registro: string }>>(`SELECT item.id, item.codigo_registro
      FROM movement_items item JOIN movements movement ON movement.id=item.movement_id WHERE movement.type='REVISAO'`))[0];
    await db.query(`UPDATE movement_items SET pcp_execution_status='EXECUTADA', pcp_executed_by_user_id=$1,
      pcp_executed_at=now() WHERE id=$2`, [userId, review.id]);
    const csv = await history.exportCsv(query({ search: review.codigo_registro, type: 'REVISAO' }), user);
    expect(csv.split('\r\n')).toHaveLength(3);
    expect(csv).toContain('"Quantidade para Lata Boa (LATA_BOA)"');
    expect(csv).toContain('"Quantidade para Varejo (VAREJO)"');
    expect(csv).toContain('"Quantidade para TUF (TUF)"');
    const transferId = randomUUID();
    const transferItemId = randomUUID();
    const targetBatchId = randomUUID();
    await db.query(`INSERT INTO batches(id,product_id,code,manufacturing_date,expiration_date,created_by,updated_by)
      VALUES ($1,$2,'NOCDNV','2026-01-02','2028-01-02',$3,$3)`, [targetBatchId, productId, userId]);
    await db.query(`INSERT INTO movements(id,request_key,type,origin_location_id,destination_location_id,responsible_user_id,occurred_at,status)
      VALUES ($1,$2,'TRANSFERENCIA_INTERNA',$3,'10000000-0000-4000-8000-000000000003',$4,'2026-09-12','EFETIVADA')`,
    [transferId, randomUUID(), destinationId, userId]);
    await db.query(`INSERT INTO movement_items(id,movement_id,product_id,batch_id,destination_batch_id,quantity,
      pcp_execution_status,pcp_executed_by_user_id,pcp_executed_at)
      VALUES ($1,$2,$3,$4,$5,2,'EXECUTADA',$6,now())`, [transferItemId, transferId, productId, batchId, targetBatchId, userId]);
    const transfer = await history.exportCsv(query({ type: 'TRANSFERENCIA_INTERNA' }), user);
    expect(transfer.split('\r\n')).toHaveLength(3);
    expect(transfer).toContain(`"${transferItemId}"`);
    expect(transfer).toContain('"SOCDNV"');
    expect(transfer).toContain('"NOCDNV"');
  });

  it('exporta desmontagem e montagem misturada sem perder produtos, fatores ou origens', async () => {
    const packageId = randomUUID();
    const packageBatchId = randomUUID();
    const reviewId = randomUUID();
    const reviewItemId = randomUUID();
    await db.query(`INSERT INTO products(id,code,name,default_unit,units_per_package,created_by,updated_by)
      VALUES ($1,'800003','Fardo cadastro','FD',24,$2,$2)`, [packageId, userId]);
    await db.query('INSERT INTO product_unit_options(package_product_id,unit_product_id) VALUES ($1,$2)', [packageId, productId]);
    await db.query(`INSERT INTO batches(id,product_id,code,manufacturing_date,expiration_date,created_by,updated_by)
      VALUES ($1,$2,'SOCDNV','2026-01-01','2028-01-01',$3,$3)`, [packageBatchId, packageId, userId]);
    await db.query(`INSERT INTO movements(id,request_key,type,origin_location_id,responsible_user_id,occurred_at,status)
      VALUES ($1,$2,'REVISAO','10000000-0000-4000-8000-000000000002',$3,'2026-09-13','EFETIVADA')`,
    [reviewId, randomUUID(), userId]);
    await db.query(`INSERT INTO movement_items(id,movement_id,product_id,batch_id,quantity,product_snapshot,
      output_product_id,output_batch_id,output_quantity,units_per_package,output_product_snapshot,
      pcp_execution_status,pcp_executed_by_user_id,pcp_executed_at)
      VALUES ($1,$2,$3,$4,2,$5,$6,$7,48,24,$8,'EXECUTADA',$9,now())`,
    [reviewItemId, reviewId, packageId, packageBatchId, { code: '800003', name: 'Fardo histórico', defaultUnit: 'FD' },
      productId, batchId, { code: '800002', name: 'Unidade histórica', defaultUnit: 'UN' }, userId]);
    await db.query(`INSERT INTO movement_item_distributions(id,movement_item_id,destination_location_id,quantity)
      VALUES ($1,$2,'10000000-0000-4000-8000-000000000003',48)`, [randomUUID(), reviewItemId]);
    const code = (await db.query<Array<{ codigo_registro: string }>>('SELECT codigo_registro FROM movement_items WHERE id=$1', [reviewItemId]))[0].codigo_registro;
    const csv = await history.exportCsv(query({ search: code }), user);
    expect(csv.split('\r\n')).toHaveLength(3);
    expect(csv).toContain('"Fardo histórico"');
    expect(csv).not.toContain('"Fardo cadastro"');
    expect(csv).toContain('"Unidade histórica"');
    expect(csv).toContain('"48"');
    expect(csv).toContain('"24"');

    const assembledId = randomUUID();
    const assembledItemId = randomUUID();
    const assembledMovementId = randomUUID();
    const source2 = (await db.query<Array<{ id: string }>>("SELECT id FROM batches WHERE product_id=$1 AND code='NOCDNV'", [productId]))[0].id;
    const assembly = { packageProductId: packageId, packageProductSnapshot: { code: '800003', name: 'Fardo histórico', defaultUnit: 'FD' },
      packageQuantity: 2, unitsPerPackage: 24, mixedDates: true, outputLot: '0', outputManufacturingDate: null, outputExpirationDate: null,
      sources: [{ batchId, stockLocationId: destinationId, quantity: 24, lot: 'SOCDNV', manufacturingDate: '2026-01-01', expirationDate: '2028-01-01', locationName: 'Lata Boa' },
        { batchId: source2, stockLocationId: destinationId, quantity: 24, lot: 'NOCDNV', manufacturingDate: '2026-01-02', expirationDate: '2028-01-02', locationName: 'Lata Boa' }] };
    await db.query(`INSERT INTO shipments(id,request_key,origin_sector,destination_sector,created_by_id,destination_location_id,
      status,decided_by_id,decided_at,shipment_kind) VALUES ($1,$2,'REVISAO','EXPEDICAO',$3,$4,'CONFIRMADO',$3,now(),'MONTAGEM')`,
    [assembledId, randomUUID(), userId, originId]);
    await db.query(`INSERT INTO shipment_items(id,shipment_id,product_id,batch_id,stock_location_id,quantity,product_snapshot,assembly)
      VALUES ($1,$2,$3,$4,$5,48,$6,$7)`, [assembledItemId, assembledId, productId, batchId, destinationId,
      { code: '800002', name: 'Unidade histórica', defaultUnit: 'UN' }, assembly]);
    await db.query(`INSERT INTO movements(id,request_key,type,origin_location_id,destination_location_id,responsible_user_id,occurred_at,status,shipment_id)
      VALUES ($1,$2,'SAIDA_EXTERNA',$3,$4,$5,now(),'EFETIVADA',$6)`,
    [assembledMovementId, randomUUID(), destinationId, originId, userId, assembledId]);
    await db.query(`INSERT INTO movement_items(id,movement_id,product_id,batch_id,quantity,product_snapshot,assembly,shipment_item_id,
      pcp_execution_status,pcp_executed_by_user_id,pcp_executed_at) VALUES ($1,$2,$3,$4,48,$5,$6,$7,'EXECUTADA',$8,now())`,
    [randomUUID(), assembledMovementId, productId, batchId, { code: '800002', name: 'Unidade histórica', defaultUnit: 'UN' }, assembly, assembledItemId, userId]);
    const shipmentCode = (await db.query<Array<{ codigo_movimentacao: string }>>('SELECT codigo_movimentacao FROM shipments WHERE id=$1', [assembledId]))[0].codigo_movimentacao;
    for (const reader of [user, { ...user, sector: 'PCP', permissions: ['pcp.movements.read'] }]) {
      const assembled = await history.exportCsv(query({ search: shipmentCode }), reader);
      expect(assembled.split('\r\n')).toHaveLength(3); // No duplicate movement/shipment row.
      expect(assembled).toContain('"Fardo histórico"');
      expect(assembled).toContain('"Origem 2 da montagem - Lote"');
      expect(assembled).toContain('"NOCDNV"');
      expect(assembled).toContain('"Sim"');
      expect(assembled).toContain('"0"');
    }
  });
});
