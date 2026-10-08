import { MigrationInterface, QueryRunner } from 'typeorm';

export class RecentOperationLookup1791504000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE INDEX "IDX_movements_recent_duplicate" ON movements
      (type, origin_location_id, created_at DESC, destination_location_id) WHERE status='EFETIVADA'`);
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP INDEX "IDX_movements_recent_duplicate"');
  }
}
