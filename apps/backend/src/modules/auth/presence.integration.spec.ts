import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { databaseEntities, databaseMigrations } from '../../database/typeorm.config';
import { AuthSessionEntity } from './entities/auth-session.entity';
import { PresenceRepository } from './presence.repository';

const databaseUrl = process.env.TEST_DATABASE_URL;

(databaseUrl ? describe : describe.skip)('Presença online (PostgreSQL)', () => {
  let db: DataSource;
  let repository: PresenceRepository;
  let pcpId: string;
  let otherPcpId: string;
  let adminId: string;

  const createUser = async (username: string, sector: string): Promise<string> => {
    const id = randomUUID();
    await db.query(
      'INSERT INTO users (id, username, sector, password_hash) VALUES ($1, $2, $3, $4)',
      [id, username, sector, '$argon2id$test-only'],
    );
    return id;
  };
  const createSession = async (userId: string, mode: string): Promise<AuthSessionEntity> => {
    const session = Object.assign(new AuthSessionEntity(), {
      userId,
      refreshTokenHash: randomUUID().replaceAll('-', '').padEnd(64, 'a'),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      revokedAt: null,
      lastUsedAt: new Date(),
      operationalMode: mode,
    });
    return db.getRepository(AuthSessionEntity).save(session);
  };

  beforeAll(async () => {
    if (!new URL(databaseUrl!).pathname.endsWith('_test')) throw new Error('Exige banco descartável _test.');
    db = new DataSource({
      type: 'postgres', url: databaseUrl, entities: databaseEntities,
      migrations: databaseMigrations, migrationsTableName: 'schema_migrations',
      dropSchema: true, migrationsRun: true, synchronize: false,
    });
    await db.initialize();
    repository = new PresenceRepository(db.getRepository(AuthSessionEntity));
  });

  beforeEach(async () => {
    await db.query('TRUNCATE users CASCADE');
    pcpId = await createUser('pcp-atual', 'PCP');
    otherPcpId = await createUser('pcp-colega', 'PCP');
    adminId = await createUser('admin-geral', 'REVISAO');
  });

  afterAll(async () => { if (db?.isInitialized) await db.destroy(); });

  it('inclui outro PCP ativo, exclui o próprio e atualiza modo/instante por sessão', async () => {
    const own = await createSession(pcpId, 'PCP');
    await createSession(otherPcpId, 'PCP');
    const admin = await createSession(adminId, 'ADMIN');

    expect((await repository.listOnlineUsers(true, pcpId)).map((item) => item.username))
      .toEqual(['pcp-colega']);
    expect(await repository.heartbeat(admin.id, adminId, 'PCP')).toBe(true);
    expect((await repository.listOnlineUsers(true, pcpId)).map((item) => item.username).sort())
      .toEqual(['admin-geral', 'pcp-colega']);
    expect(await repository.heartbeat(own.id, pcpId, 'PCP')).toBe(true);
    expect((await repository.listOnlineUsers()).map((item) => item.username).sort())
      .toEqual(['admin-geral', 'pcp-atual', 'pcp-colega']);
    expect((await repository.listOnlineUsers())[0].lastSeenAt).toMatch(/Z$/);
  });

  it('ignora sessões sem atividade recente, revogadas, expiradas e contas inativas', async () => {
    const stale = await createSession(pcpId, 'PCP');
    const revoked = await createSession(otherPcpId, 'PCP');
    const expired = await createSession(adminId, 'ADMIN');
    await db.query("UPDATE auth_sessions SET last_used_at = CURRENT_TIMESTAMP - INTERVAL '61 seconds' WHERE id = $1", [stale.id]);
    await db.query('UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = $1', [revoked.id]);
    await db.query("UPDATE auth_sessions SET created_at = CURRENT_TIMESTAMP - INTERVAL '2 hours', expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE id = $1", [expired.id]);
    expect(await repository.listOnlineUsers()).toEqual([]);
    expect(await repository.heartbeat(revoked.id, otherPcpId, 'PCP')).toBe(false);
    expect(await repository.heartbeat(expired.id, adminId, 'ADMIN')).toBe(false);

    await repository.heartbeat(stale.id, pcpId, 'PCP');
    expect(await repository.listOnlineUsers()).toHaveLength(1);
    await db.query("UPDATE users SET status = 'INACTIVE' WHERE id = $1", [pcpId]);
    expect(await repository.listOnlineUsers()).toEqual([]);
  });
});
