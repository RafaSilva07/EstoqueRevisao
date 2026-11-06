import { MigrationInterface, QueryRunner } from 'typeorm';

export class SystemLogsMonitoring1791590400000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE IF NOT EXISTS "system_logs" (
        "id" uuid PRIMARY KEY,
        "timestamp" timestamptz NOT NULL DEFAULT now(),
        "level" varchar(20) NOT NULL,
        "error_code" varchar(100),
        "event_id" varchar(100) NOT NULL,
        "description" text NOT NULL,
        "context" varchar(150) NOT NULL,
        "details" jsonb,
        "environment" varchar(50) NOT NULL DEFAULT 'development'
      );

      CREATE INDEX IF NOT EXISTS "IDX_system_logs_timestamp" ON "system_logs" ("timestamp" DESC);
      CREATE INDEX IF NOT EXISTS "IDX_system_logs_level" ON "system_logs" ("level");
      CREATE INDEX IF NOT EXISTS "IDX_system_logs_error_code" ON "system_logs" ("error_code");
      CREATE INDEX IF NOT EXISTS "IDX_system_logs_event_id" ON "system_logs" ("event_id");
      CREATE INDEX IF NOT EXISTS "IDX_system_logs_context" ON "system_logs" ("context");
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE IF EXISTS "system_logs"');
  }
}

