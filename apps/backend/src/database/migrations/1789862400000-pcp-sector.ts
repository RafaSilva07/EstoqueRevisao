import { MigrationInterface, QueryRunner } from 'typeorm';

export class PcpSector1789862400000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE users DROP CONSTRAINT users_sector_check;
      ALTER TABLE users ADD CONSTRAINT users_sector_check
        CHECK (sector IN ('REVISAO', 'PRODUCAO', 'EXPEDICAO', 'PCP'));
      UPDATE users SET sector = 'PCP'
      WHERE id IN (
        SELECT ur.user_id FROM user_roles ur
        INNER JOIN roles r ON r.id = ur.role_id
        WHERE r.code = 'PCP'
      );
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`
      UPDATE users SET sector = 'REVISAO' WHERE sector = 'PCP';
      ALTER TABLE users DROP CONSTRAINT users_sector_check;
      ALTER TABLE users ADD CONSTRAINT users_sector_check
        CHECK (sector IN ('REVISAO', 'PRODUCAO', 'EXPEDICAO'));
    `);
  }
}
