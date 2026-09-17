import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { databaseEntities, databaseMigrations } from '../../database/typeorm.config';
import { AuditRepository } from '../audit/audit.repository';
import { AuditService } from '../audit/audit.service';
import { AuditLogEntity } from '../audit/entities/audit-log.entity';
import { MovementType } from '../movements/domain/movement-type.enum';
import { MovementEntity } from '../movements/entities/movement.entity';
import { MovementsRepository } from '../movements/movements.repository';
import { ShipmentEntity, ShipmentItemEntity } from '../shipments/shipment.entity';
import { PcpExecutionStatus } from './domain/pcp-execution-status.enum';
import { PcpMovementsRepository } from './pcp-movements.repository';
import { PcpMovementsService } from './pcp-movements.service';

const databaseUrl = process.env.TEST_DATABASE_URL;
(databaseUrl ? describe : describe.skip)('Fila PCP (PostgreSQL)', () => {
  let db: DataSource;
  let service: PcpMovementsService;
  let userId: string;
  let originId: string;
  let destinationId: string;
  let productId: string;
  let batchId: string;
  let movementIds: string[];

  beforeAll(async () => {
    if (!new URL(databaseUrl!).pathname.endsWith('_test')) throw new Error('Exige banco descartavel _test.');
    db = new DataSource({ type: 'postgres', url: databaseUrl, entities: databaseEntities, migrations: databaseMigrations,
      migrationsTableName: 'schema_migrations', dropSchema: true, migrationsRun: true, synchronize: false });
    await db.initialize();
    const movements = new MovementsRepository(db.getRepository(MovementEntity));
    service = new PcpMovementsService(
      new PcpMovementsRepository(db.getRepository(MovementEntity), db.getRepository(AuditLogEntity), db.getRepository(ShipmentItemEntity), db.getRepository(ShipmentEntity)),
      movements, db, new AuditService(new AuditRepository(db.getRepository(AuditLogEntity))),
    );
    userId = randomUUID(); productId = randomUUID(); batchId = randomUUID(); originId = randomUUID();
    await db.query("INSERT INTO users(id,username,password_hash) VALUES ($1,'pcp-integration','$argon2id$test')", [userId]);
    await db.query("INSERT INTO products(id,code,name,default_unit,created_by,updated_by) VALUES ($1,'PCP-001','Produto PCP','UN',$2,$2)", [productId, userId]);
    await db.query("INSERT INTO batches(id,product_id,code,manufacturing_date,expiration_date,created_by,updated_by) VALUES ($1,$2,'SOCDNV','2026-01-01','2028-01-01',$3,$3)", [batchId, productId, userId]);
    await db.query("INSERT INTO stock_locations(id,code,name,kind,created_by,updated_by) VALUES ($1,'PCP_ORIGIN','Origem PCP','EXTERNAL',$2,$2)", [originId, userId]);
    destinationId = (await db.query<Array<{ id: string }>>("SELECT id FROM stock_locations WHERE code='REVISAR'"))[0].id;
  });

  beforeEach(async () => {
    await db.query('TRUNCATE audit_logs, movement_items, movements CASCADE');
    movementIds = [];
    const types = Object.values(MovementType);
    for (let index = 0; index < types.length; index += 1) {
      const id = randomUUID(); movementIds.push(id);
      const movementDestinationId = types[index] === MovementType.Review ? null : destinationId;
      await db.query(`INSERT INTO movements(id,request_key,type,origin_location_id,destination_location_id,responsible_user_id,occurred_at,status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,'EFETIVADA')`, [id, randomUUID(), types[index], originId, movementDestinationId, userId, new Date(Date.UTC(2026, 8, index + 1))]);
      await db.query(`INSERT INTO movement_items(id,movement_id,product_id,batch_id,quantity,product_snapshot)
        VALUES ($1,$2,$3,$4,$5,$6)`, [randomUUID(), id, productId, batchId, index + 1, { code: 'PCP-001', name: 'Produto PCP', defaultUnit: 'UN' }]);
    }
    const canceledId = randomUUID(); movementIds.push(canceledId);
    await db.query(`INSERT INTO movements(id,request_key,type,origin_location_id,destination_location_id,responsible_user_id,occurred_at,status,canceled_by_user_id,canceled_at,cancellation_reason)
      VALUES ($1,$2,'ENTRADA_EXTERNA',$3,$4,$5,'2026-09-10','CANCELADA',$5,'2026-09-11','Teste de cancelamento')`, [canceledId, randomUUID(), originId, destinationId, userId]);
  });

  afterAll(async () => { if (db?.isInitialized) await db.destroy(); });

  it('combina filtros, busca, ordenacao e paginacao no backend', async () => {
    const filtered = await service.list({ page: 1, limit: 20, operationalStatus: 'CONCLUIDA', pcpStatus: PcpExecutionStatus.Pending,
      type: MovementType.InternalTransfer, originLocationId: originId, destinationLocationId: destinationId, search: 'SOCDNV',
      dateFrom: '2026-09-03T00:00:00.000Z', dateTo: '2026-09-03T23:59:59.999Z', sort: 'ASC' });
    expect(filtered.meta.total).toBe(1);
    expect(filtered.items[0].type).toBe(MovementType.InternalTransfer);

    const ascending = await service.list({ page: 1, limit: 1, operationalStatus: 'CONCLUIDA', sort: 'ASC' });
    const descending = await service.list({ page: 1, limit: 1, operationalStatus: 'CONCLUIDA', sort: 'DESC' });
    expect(ascending.meta.total).toBe(4);
    expect(ascending.items[0].id).toBe(movementIds[0]);
    expect(descending.items[0].id).toBe(movementIds[3]);

    const canceled = await service.list({ page: 1, limit: 20, operationalStatus: 'CANCELADA', sort: 'DESC' });
    expect(canceled.meta.total).toBe(1);
  });

  it('mantem o perfil PCP restrito a leitura e execucao administrativa', async () => {
    const rows = await db.query<Array<{ code: string }>>(`SELECT permission.code FROM role_permissions assignment
      INNER JOIN roles role ON role.id = assignment.role_id
      INNER JOIN permissions permission ON permission.id = assignment.permission_id
      WHERE role.code = 'PCP' ORDER BY permission.code`);
    const permissions = rows.map((row) => row.code);
    expect(permissions).toEqual(expect.arrayContaining(['pcp.movements.read', 'pcp.movements.execute', 'products.read', 'shipments.read']));
    expect(permissions).not.toEqual(expect.arrayContaining(['movements.create', 'movements.cancel', 'shipments.create', 'shipments.decide']));
  });

  it('serializa execucoes concorrentes e preserva uma unica auditoria', async () => {
    const metadata = { requestId: randomUUID(), ipAddress: null, userAgent: 'pcp-integration' };
    const outcomes = await Promise.allSettled([
      service.execute(movementIds[0], { observation: 'Corporativo 123' }, userId, metadata),
      service.execute(movementIds[0], { observation: 'Repetida' }, userId, { ...metadata, requestId: randomUUID() }),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
    const persisted = await db.getRepository(MovementEntity).findOneByOrFail({ id: movementIds[0] });
    expect(persisted.pcpExecutionStatus).toBe(PcpExecutionStatus.Executed);
    expect(persisted.pcpExecutedByUserId).toBe(userId);
    expect(persisted.pcpExecutionObservation).toBe('Corporativo 123');
    expect(await db.getRepository(AuditLogEntity).countBy({ entityId: movementIds[0], action: 'PCP_MOVEMENT_EXECUTE' })).toBe(1);
  });
});
