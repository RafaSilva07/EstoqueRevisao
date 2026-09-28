import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProductCodeFormat1790640000000 implements MigrationInterface {
  name = 'ProductCodeFormat1790640000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query(
      "SELECT count(*)::int AS total FROM products WHERE code !~ '^[0-9]{6}([.][0-9]{2})?$'",
    ) as Array<{ total: number }>;
    const invalidCount = Number(rows[0]?.total ?? 0);
    if (invalidCount > 0) {
      throw new Error(`Há ${invalidCount} produto(s) com código fora do formato 123456 ou 123456.78. Corrija-os antes de executar esta migration; nenhum código será alterado automaticamente.`);
    }
    await queryRunner.query(
      "ALTER TABLE products ADD CONSTRAINT \"CHK_products_code_format\" CHECK (code ~ '^[0-9]{6}([.][0-9]{2})?$')",
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE products DROP CONSTRAINT "CHK_products_code_format"');
  }
}
