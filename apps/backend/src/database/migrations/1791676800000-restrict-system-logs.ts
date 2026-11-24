import { MigrationInterface, QueryRunner } from 'typeorm';

export class RestrictSystemLogs1791676800000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query('ALTER TABLE "system_logs" ENABLE ROW LEVEL SECURITY');
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('ALTER TABLE "system_logs" DISABLE ROW LEVEL SECURITY');
  }
}
