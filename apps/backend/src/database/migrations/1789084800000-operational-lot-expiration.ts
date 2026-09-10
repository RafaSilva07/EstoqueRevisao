import { MigrationInterface, QueryRunner } from 'typeorm';

export class OperationalLotExpiration1789084800000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    // Do not guess a default for existing products or rewrite existing history.
    await runner.query('ALTER TABLE products ADD COLUMN shelf_life_years integer, ADD CONSTRAINT "CHK_products_shelf_life" CHECK (shelf_life_years > 0)');
    await runner.query('DROP INDEX "UQ_batches_product_code_ci"');
    await runner.query('CREATE UNIQUE INDEX "UQ_batches_product_code_expiration_ci" ON batches (product_id, LOWER(code), expiration_date)');
    await runner.query('ALTER TABLE movement_items ADD COLUMN product_snapshot jsonb');
    // Dates are preserved through immutable batch variants, including old references.
    await runner.query(`
      CREATE OR REPLACE FUNCTION protect_batch_identity() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF (NEW.product_id, NEW.code, NEW.manufacturing_date, NEW.expiration_date)
          IS DISTINCT FROM (OLD.product_id, OLD.code, OLD.manufacturing_date, OLD.expiration_date) THEN
          RAISE EXCEPTION 'Operational lot identity is immutable' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END; $$;
      CREATE TRIGGER batches_immutable_identity BEFORE UPDATE ON batches
        FOR EACH ROW EXECUTE FUNCTION protect_batch_identity();
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    // Refuse rollback when it would merge distinct expirations or discard snapshots.
    await runner.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM batches GROUP BY product_id, LOWER(code) HAVING count(*) > 1)
        OR EXISTS (SELECT 1 FROM movement_items WHERE product_snapshot IS NOT NULL) THEN
        RAISE EXCEPTION 'Rollback blocked: operational lot history must be preserved';
      END IF;
    END $$`);
    await runner.query('DROP TRIGGER batches_immutable_identity ON batches');
    await runner.query('DROP FUNCTION protect_batch_identity()');
    await runner.query('ALTER TABLE movement_items DROP COLUMN product_snapshot');
    await runner.query('DROP INDEX "UQ_batches_product_code_expiration_ci"');
    await runner.query('CREATE UNIQUE INDEX "UQ_batches_product_code_ci" ON batches (product_id, LOWER(code))');
    await runner.query('ALTER TABLE products DROP COLUMN shelf_life_years');
  }
}
