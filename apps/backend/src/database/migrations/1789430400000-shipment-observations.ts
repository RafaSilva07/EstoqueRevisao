import { MigrationInterface, QueryRunner } from 'typeorm';

export class ShipmentObservations1789430400000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE shipments
        ADD observation varchar(1000),
        ADD CONSTRAINT shipments_observation_not_blank
          CHECK (observation IS NULL OR length(trim(observation)) > 0);
      ALTER TABLE shipment_items
        ADD observation varchar(1000),
        ADD CONSTRAINT shipment_items_observation_not_blank
          CHECK (observation IS NULL OR length(trim(observation)) > 0);
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    const rows = await runner.query('SELECT 1 FROM shipments LIMIT 1') as unknown[];
    if (rows.length) throw new Error('Existem envios: rollback destrutivo não permitido.');
    await runner.query(`
      ALTER TABLE shipment_items DROP CONSTRAINT shipment_items_observation_not_blank, DROP COLUMN observation;
      ALTER TABLE shipments DROP CONSTRAINT shipments_observation_not_blank, DROP COLUMN observation;
    `);
  }
}
