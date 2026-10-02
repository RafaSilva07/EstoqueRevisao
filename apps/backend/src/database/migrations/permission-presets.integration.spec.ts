import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { databaseEntities, databaseMigrations } from '../typeorm.config';
import { PermissionPresets1791244800000 } from './1791244800000-permission-presets';

const databaseUrl = process.env.TEST_DATABASE_URL;
(databaseUrl ? describe : describe.skip)('Migração de permissões por usuário (PostgreSQL)', () => {
  let db: DataSource;
  const admin = randomUUID();
  const operator = randomUUID();
  beforeAll(async () => {
    if (!new URL(databaseUrl!).pathname.endsWith('_test')) throw new Error('Exige banco descartável _test.');
    db = new DataSource({ type: 'postgres', url: databaseUrl, entities: databaseEntities,
      migrations: databaseMigrations.filter((migration) => migration !== PermissionPresets1791244800000),
      migrationsTableName: 'schema_migrations', dropSchema: true, migrationsRun: true, synchronize: false });
    await db.initialize();
    await db.query("INSERT INTO users(id,username,password_hash) VALUES ($1,'admin-backfill','$argon2id$test'),($2,'operator-backfill','$argon2id$test')", [admin, operator]);
    await db.query("INSERT INTO user_roles(user_id,role_id) SELECT CASE WHEN code='ADMIN' THEN $1::uuid ELSE $2::uuid END,id FROM roles WHERE code IN ('ADMIN','REVISAO')", [admin, operator]);
    db.migrations.push(new PermissionPresets1791244800000());
    await db.runMigrations();
  });
  afterAll(async () => { if (db?.isInitialized) await db.destroy(); });

  it('preserva os acessos existentes e mantém entrada direta exclusiva do preset ADMIN inicial', async () => {
    const rows = await db.query<{ code: string; preset_allowed: boolean; override: boolean | null }[]>(
      'SELECT p.code,up.preset_allowed,up.override FROM user_permissions up JOIN permissions p ON p.id=up.permission_id WHERE up.user_id=$1', [operator]);
    expect(rows.find((row) => row.code === 'movements.review')?.preset_allowed).toBe(true);
    expect(rows.find((row) => row.code === 'products.manage-status')?.preset_allowed).toBe(true);
    expect(rows.find((row) => row.code === 'movements.external-entry')?.preset_allowed).toBe(false);
    expect(rows.every((row) => row.override === null)).toBe(true);
    const allowed = await db.query<{ preset_allowed: boolean }[]>(
      "SELECT up.preset_allowed FROM user_permissions up JOIN permissions p ON p.id=up.permission_id WHERE up.user_id=$1 AND p.code='movements.external-entry'", [admin]);
    expect(allowed[0].preset_allowed).toBe(true);
  });

  it('recusa rollback que perderia personalizações e permite reversão sem dados personalizados', async () => {
    await db.query("UPDATE user_permissions SET override=true WHERE user_id=$1 AND permission_id=(SELECT id FROM permissions WHERE code='movements.external-entry')", [operator]);
    await expect(db.undoLastMigration()).rejects.toThrow('Há permissões/presets personalizados');
    await db.query('UPDATE user_permissions SET override=NULL');
    await db.undoLastMigration();
    const [{ count }] = await db.query<{ count: string }[]>("SELECT COUNT(*)::text AS count FROM users WHERE id IN ($1,$2)", [admin, operator]);
    expect(count).toBe('2');
    await db.runMigrations();
    expect(await db.showMigrations()).toBe(false);
  });
});
