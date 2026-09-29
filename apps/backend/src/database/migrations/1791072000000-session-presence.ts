import { MigrationInterface, QueryRunner } from 'typeorm';

export class SessionPresence1791072000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE auth_sessions
        ADD COLUMN operational_mode varchar(10),
        ADD CONSTRAINT auth_sessions_operational_mode_check
          CHECK (operational_mode IS NULL OR operational_mode IN ('ADMIN', 'REVISAO', 'PRODUCAO', 'EXPEDICAO', 'PCP'));
      CREATE INDEX idx_auth_sessions_presence
        ON auth_sessions (operational_mode, last_used_at DESC)
        WHERE revoked_at IS NULL AND operational_mode IS NOT NULL;
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`
      DROP INDEX idx_auth_sessions_presence;
      ALTER TABLE auth_sessions
        DROP CONSTRAINT auth_sessions_operational_mode_check,
        DROP COLUMN operational_mode;
    `);
  }
}
