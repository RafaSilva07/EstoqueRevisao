import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReviewPackageUnpacking1789516800000 implements MigrationInterface {
  name = 'ReviewPackageUnpacking1789516800000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE products ADD COLUMN units_per_package integer,
        ADD CONSTRAINT "CHK_products_package_units" CHECK (units_per_package IS NULL OR (default_unit IN ('FD','CX') AND units_per_package > 0));
      CREATE TABLE product_unit_options (
        package_product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        unit_product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        PRIMARY KEY(package_product_id, unit_product_id),
        CHECK(package_product_id <> unit_product_id)
      );
      CREATE INDEX "IDX_unit_options_unit" ON product_unit_options(unit_product_id);
      ALTER TABLE movement_items
        ADD COLUMN output_product_id uuid REFERENCES products(id) ON DELETE RESTRICT,
        ADD COLUMN output_batch_id uuid,
        ADD COLUMN output_quantity numeric(18,6),
        ADD COLUMN units_per_package integer,
        ADD COLUMN output_product_snapshot jsonb,
        ADD CONSTRAINT "FK_review_output_batch" FOREIGN KEY(output_batch_id, output_product_id) REFERENCES batches(id,product_id) ON DELETE RESTRICT,
        ADD CONSTRAINT "CHK_review_output" CHECK (
          (output_product_id IS NULL AND output_batch_id IS NULL AND output_quantity IS NULL AND units_per_package IS NULL AND output_product_snapshot IS NULL)
          OR (output_product_id IS NOT NULL AND output_batch_id IS NOT NULL AND output_quantity IS NOT NULL AND units_per_package IS NOT NULL AND output_product_snapshot IS NOT NULL
              AND output_product_id <> product_id AND units_per_package > 0 AND output_quantity > 0
              AND output_quantity = quantity * units_per_package AND output_quantity = trunc(output_quantity))
        );
      CREATE INDEX "IDX_review_output_product" ON movement_items(output_product_id);
      CREATE OR REPLACE FUNCTION validate_review_output() RETURNS trigger AS $$
      BEGIN
        IF NEW.output_product_id IS NOT NULL AND (
          NOT EXISTS (SELECT 1 FROM movements WHERE id=NEW.movement_id AND type='REVISAO')
          OR NOT EXISTS (SELECT 1 FROM batches source JOIN batches target
            ON source.code=target.code AND source.manufacturing_date=target.manufacturing_date AND source.expiration_date=target.expiration_date
            WHERE source.id=NEW.batch_id AND target.id=NEW.output_batch_id)
        ) THEN RAISE EXCEPTION 'Conversão de revisão incompatível com movimento/lote' USING ERRCODE='23514'; END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER validate_review_output BEFORE INSERT OR UPDATE ON movement_items FOR EACH ROW EXECUTE FUNCTION validate_review_output();
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    const rows = await runner.query('SELECT 1 FROM movement_items WHERE output_product_id IS NOT NULL UNION ALL SELECT 1 FROM products WHERE units_per_package IS NOT NULL LIMIT 1') as unknown[];
    if (rows.length) throw new Error('Existem configurações ou revisões com desmontagem; rollback destrutivo bloqueado.');
    await runner.query(`
      DROP TRIGGER validate_review_output ON movement_items;
      DROP FUNCTION validate_review_output();
      ALTER TABLE movement_items DROP COLUMN output_product_id, DROP COLUMN output_batch_id, DROP COLUMN output_quantity, DROP COLUMN units_per_package, DROP COLUMN output_product_snapshot;
      DROP TABLE product_unit_options;
      ALTER TABLE products DROP COLUMN units_per_package;
    `);
  }
}
