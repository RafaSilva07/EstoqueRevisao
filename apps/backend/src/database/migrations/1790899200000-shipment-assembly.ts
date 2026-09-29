import { MigrationInterface, QueryRunner } from 'typeorm';

export class ShipmentAssembly1790899200000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE shipments DROP CONSTRAINT shipments_shipment_kind_check;
      ALTER TABLE shipments ADD CONSTRAINT shipments_shipment_kind_check
        CHECK (shipment_kind IN ('NORMAL', 'RETORNO_IMEDIATO', 'MONTAGEM'));
      ALTER TABLE shipments ADD CONSTRAINT shipments_assembly_route_check
        CHECK (shipment_kind <> 'MONTAGEM' OR (origin_sector = 'REVISAO' AND destination_sector = 'EXPEDICAO'));

      ALTER TABLE shipment_items ADD COLUMN assembly jsonb;
      ALTER TABLE movement_items ADD COLUMN assembly jsonb;
      ALTER TABLE shipment_items ADD CONSTRAINT shipment_items_assembly_valid CHECK (
        assembly IS NULL OR (
          jsonb_typeof(assembly) = 'object'
          AND jsonb_typeof(assembly->'sources') = 'array'
          AND jsonb_array_length(assembly->'sources') > 0
          AND (assembly->>'packageQuantity')::numeric > 0
          AND (assembly->>'unitsPerPackage')::numeric > 0
          AND quantity = (assembly->>'packageQuantity')::numeric * (assembly->>'unitsPerPackage')::numeric
        )
      );
      ALTER TABLE movement_items ADD CONSTRAINT movement_items_assembly_valid CHECK (
        assembly IS NULL OR (
          jsonb_typeof(assembly) = 'object'
          AND quantity = (assembly->>'packageQuantity')::numeric * (assembly->>'unitsPerPackage')::numeric
        )
      );
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    const rows = await runner.query("SELECT 1 FROM shipments WHERE shipment_kind = 'MONTAGEM' LIMIT 1") as unknown[];
    if (rows.length) throw new Error('Existem envios de montagem: rollback destrutivo não permitido.');
    await runner.query(`
      ALTER TABLE movement_items DROP CONSTRAINT movement_items_assembly_valid;
      ALTER TABLE shipment_items DROP CONSTRAINT shipment_items_assembly_valid;
      ALTER TABLE movement_items DROP COLUMN assembly;
      ALTER TABLE shipment_items DROP COLUMN assembly;
      ALTER TABLE shipments DROP CONSTRAINT shipments_assembly_route_check;
      ALTER TABLE shipments DROP CONSTRAINT shipments_shipment_kind_check;
      ALTER TABLE shipments ADD CONSTRAINT shipments_shipment_kind_check
        CHECK (shipment_kind IN ('NORMAL', 'RETORNO_IMEDIATO'));
    `);
  }
}
