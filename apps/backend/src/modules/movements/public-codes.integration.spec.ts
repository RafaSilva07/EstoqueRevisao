import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { databaseEntities, databaseMigrations } from '../../database/typeorm.config';
import { MovementEntity } from './entities/movement.entity';
import { MovementQueryDto } from './dto/movement-query.dto';
import { MovementsRepository } from './movements.repository';

const databaseUrl = process.env.TEST_DATABASE_URL;
(databaseUrl ? describe : describe.skip)('Códigos públicos (PostgreSQL)', () => {
  let db: DataSource;
  const userId = randomUUID();
  const insert = async (type: string, date = '2026-09-01'): Promise<{ id: string; codigo_movimentacao: string | null }> => {
    const rows = await db.query<Array<{ id: string; codigo_movimentacao: string | null }>>(`INSERT INTO movements (id, request_key, type, origin_location_id, destination_location_id, responsible_user_id, occurred_at, status)
      VALUES ($1,$2,$3::varchar,'10000000-0000-4000-8000-000000000002',CASE WHEN $3::varchar = 'REVISAO' THEN NULL ELSE '10000000-0000-4000-8000-000000000003'::uuid END,$4,$5,'EFETIVADA') RETURNING *`, [randomUUID(), randomUUID(), type, userId, date]);
    return rows[0];
  };
  const insertShipment = async (origin = 'EXPEDICAO', destination = 'REVISAO'): Promise<{ id: string; codigo_movimentacao: string }> => {
    const rows = await db.query<Array<{ id: string; codigo_movimentacao: string }>>(`INSERT INTO shipments
      (id, request_key, origin_sector, destination_sector, created_by_id, origin_location_id, destination_location_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, codigo_movimentacao`, [
      randomUUID(), randomUUID(), origin, destination, userId,
      origin === 'REVISAO' ? null : '10000000-0000-4000-8000-000000000006',
      destination === 'REVISAO' ? '10000000-0000-4000-8000-000000000002' : '10000000-0000-4000-8000-000000000006',
    ]);
    return rows[0];
  };
  beforeAll(async () => {
    db = new DataSource({ type: 'postgres', url: databaseUrl, entities: databaseEntities, migrations: databaseMigrations, dropSchema: true, migrationsRun: true, synchronize: false });
    await db.initialize();
    await db.query(`INSERT INTO users (id, username, password_hash, status) VALUES ($1,'public-code-test','$argon2id$integration-test-placeholder','ACTIVE')`, [userId]);
  });
  afterAll(async () => { if (db?.isInitialized) await db.destroy(); });
  it('gera sequências independentes e retorna o código na consulta/busca', async () => {
    expect((await insert('ENTRADA_EXTERNA')).codigo_movimentacao).toBe('ENT-000001');
    expect((await insert('SAIDA_EXTERNA')).codigo_movimentacao).toBe('SAI-000001');
    expect((await insert('REVISAO')).codigo_movimentacao).toBe('REV-000001');
    expect((await insert('TRANSFERENCIA_INTERNA')).codigo_movimentacao).toBeNull();
    const repository = new MovementsRepository(db.getRepository(MovementEntity));
    const [items, total] = await repository.findAndCount(Object.assign(new MovementQueryDto(), { codigoMovimentacao: ' ent-000001 ' }));
    expect(total).toBe(1);
    expect(items[0].codigoMovimentacao).toBe('ENT-000001');
  });
  it('não duplica códigos sob concorrência e impede alteração', async () => {
    const rows = await Promise.all(Array.from({ length: 20 }, () => insert('ENTRADA_EXTERNA')));
    expect(new Set(rows.map((row) => row.codigo_movimentacao)).size).toBe(20);
    await expect(db.query('UPDATE movements SET codigo_movimentacao = $1 WHERE id = $2', ['ENT-999999', rows[0].id])).rejects.toThrow('immutable');
    const indexes = await db.query<Array<{ indexname: string }>>("SELECT indexname FROM pg_indexes WHERE indexname = 'uq_movements_standalone_public_code'");
    expect(indexes).toHaveLength(1);
  });
  it('identifica o envio desde a criação e conserva o código após confirmação', async () => {
    const shipment = await insertShipment();
    expect(shipment.codigo_movimentacao).toMatch(/^ENT-\d{6}$/);
    const linked = await db.query<Array<{ codigo_movimentacao: string }>>(`INSERT INTO movements
      (id, request_key, shipment_id, type, origin_location_id, destination_location_id, responsible_user_id, occurred_at, status)
      VALUES ($1,$2,$3,'ENTRADA_EXTERNA','10000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000002',$4,now(),'EFETIVADA') RETURNING codigo_movimentacao`,
    [randomUUID(), randomUUID(), shipment.id, userId]);
    expect(linked[0].codigo_movimentacao).toBe(shipment.codigo_movimentacao);
    await db.query(`UPDATE shipments SET status='CONFIRMADO', decided_by_id=$1, decided_at=now() WHERE id=$2`, [userId, shipment.id]);
    const confirmed = await db.query<Array<{ codigo_movimentacao: string }>>('SELECT codigo_movimentacao FROM shipments WHERE id=$1', [shipment.id]);
    expect(confirmed[0].codigo_movimentacao).toBe(shipment.codigo_movimentacao);
    await expect(db.query('UPDATE shipments SET codigo_movimentacao=$1 WHERE id=$2', ['ENT-999999', shipment.id])).rejects.toThrow(/imut.vel/i);
  });
  it('não duplica códigos ao criar envios concorrentes', async () => {
    const shipments = await Promise.all(Array.from({ length: 20 }, () => insertShipment('REVISAO', 'EXPEDICAO')));
    expect(new Set(shipments.map((shipment) => shipment.codigo_movimentacao)).size).toBe(20);
    expect(shipments.every((shipment) => shipment.codigo_movimentacao.startsWith('SAI-'))).toBe(true);
  });
  it('reverte e reaplica a evolução preservando o vínculo do ciclo de vida', async () => {
    const existing = await insertShipment();
    await db.query(`INSERT INTO movements
      (id, request_key, shipment_id, type, origin_location_id, destination_location_id, responsible_user_id, occurred_at, status)
      VALUES ($1,$2,$3,'ENTRADA_EXTERNA','10000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000002',$4,now(),'EFETIVADA')`,
    [randomUUID(), randomUUID(), existing.id, userId]);
    await db.undoLastMigration();
    const legacyId = randomUUID();
    await db.query(`INSERT INTO shipments (id, request_key, origin_sector, destination_sector, created_by_id, origin_location_id, destination_location_id)
      VALUES ($1,$2,'EXPEDICAO','REVISAO',$3,'10000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000002')`,
    [legacyId, randomUUID(), userId]);
    await db.runMigrations();
    const records = await db.query<Array<{ id: string; codigo_movimentacao: string }>>('SELECT id, codigo_movimentacao FROM shipments WHERE id IN ($1,$2)', [existing.id, legacyId]);
    expect(records.find((record) => record.id === existing.id)?.codigo_movimentacao).toBe(existing.codigo_movimentacao);
    expect(records.find((record) => record.id === legacyId)?.codigo_movimentacao).toMatch(/^ENT-\d{6}$/);
  });
});
