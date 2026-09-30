import { MigrationInterface, QueryRunner } from 'typeorm';

export class ShipmentLoading1791158400000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE shipments
        ADD COLUMN loading_status varchar(15),
        ADD COLUMN vehicle_plate varchar(20),
        ADD CONSTRAINT shipments_loading_check CHECK (
          (origin_sector = 'EXPEDICAO' AND destination_sector = 'REVISAO' AND (
            (loading_status IS NULL AND vehicle_plate IS NULL)
            OR (loading_status = 'NAO_CARREGADO' AND vehicle_plate IS NULL)
            OR (loading_status = 'CARREGADO' AND vehicle_plate IS NOT NULL AND length(btrim(vehicle_plate)) > 0)
          ))
          OR (NOT (origin_sector = 'EXPEDICAO' AND destination_sector = 'REVISAO')
            AND loading_status IS NULL AND vehicle_plate IS NULL)
        );
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE shipments
        DROP CONSTRAINT shipments_loading_check,
        DROP COLUMN vehicle_plate,
        DROP COLUMN loading_status;
    `);
  }
}
