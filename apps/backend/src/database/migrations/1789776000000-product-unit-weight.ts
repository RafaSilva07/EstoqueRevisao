import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProductUnitWeight1789776000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE products
        ADD unit_weight_grams integer,
        ADD CONSTRAINT product_unit_weight_valid CHECK (
          unit_weight_grams IS NULL OR (default_unit = 'UN' AND unit_weight_grams > 0)
        );
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    const configured = await runner.query('SELECT 1 FROM products WHERE unit_weight_grams IS NOT NULL LIMIT 1') as unknown[];
    if (configured.length) throw new Error('Existem gramaturas cadastradas: rollback destrutivo nao permitido.');
    await runner.query('ALTER TABLE products DROP CONSTRAINT product_unit_weight_valid, DROP COLUMN unit_weight_grams');
  }
}
