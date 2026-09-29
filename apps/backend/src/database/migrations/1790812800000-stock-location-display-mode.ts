import { MigrationInterface, QueryRunner } from 'typeorm';

export class StockLocationDisplayMode1790812800000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE stock_locations
      ADD COLUMN display_mode varchar(20) NOT NULL DEFAULT 'LOTS',
      ADD CONSTRAINT CHK_stock_locations_display_mode CHECK (
        display_mode IN ('LOTS', 'PRODUCTS') AND (kind <> 'EXTERNAL' OR display_mode = 'LOTS')
      )`);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE stock_locations DROP CONSTRAINT CHK_stock_locations_display_mode`);
    await runner.query(`ALTER TABLE stock_locations DROP COLUMN display_mode`);
  }
}
