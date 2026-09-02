import { MigrationInterface, QueryRunner } from 'typeorm';

interface LegacyBatchRow {
  id: string;
  code: string;
  expiration_date: string | null;
}

const BATCH_CODE_PATTERN = /^[CONSERVADI]{6}$/;
const DIGIT_LETTERS = 'CONSERVADI';

export class BatchManufacturingAndStockPositions1788307200000 implements MigrationInterface {
  name = 'BatchManufacturingAndStockPositions1788307200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "batches" ADD "manufacturing_date" date');
    await this.migrateExistingBatches(queryRunner);

    await queryRunner.query('ALTER TABLE "batches" ALTER COLUMN "manufacturing_date" SET NOT NULL');
    await queryRunner.query('ALTER TABLE "batches" ALTER COLUMN "expiration_date" SET NOT NULL');
    await queryRunner.query('ALTER TABLE "batches" ALTER COLUMN "code" TYPE varchar(6)');
    await queryRunner.query(`
      ALTER TABLE "batches"
      ADD CONSTRAINT "CHK_batches_encoded_code"
        CHECK ("code" ~ '^[CONSERVADI]{6}$'),
      ADD CONSTRAINT "CHK_batches_manufacturing_year"
        CHECK ("manufacturing_date" BETWEEN DATE '2000-01-01' AND DATE '2099-12-31'),
      ADD CONSTRAINT "CHK_batches_expiration"
        CHECK ("expiration_date" >= "manufacturing_date"),
      ADD CONSTRAINT "UQ_batches_id_product" UNIQUE ("id", "product_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "stock_positions" (
        "id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "batch_id" uuid NOT NULL,
        "stock_location_id" uuid NOT NULL,
        "quantity" numeric(18,6) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_stock_positions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_stock_positions_product_batch_location"
          UNIQUE ("product_id", "batch_id", "stock_location_id"),
        CONSTRAINT "FK_stock_positions_product"
          FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_stock_positions_batch"
          FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_stock_positions_location"
          FOREIGN KEY ("stock_location_id") REFERENCES "stock_locations"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_stock_positions_batch_product"
          FOREIGN KEY ("batch_id", "product_id")
          REFERENCES "batches"("id", "product_id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_stock_positions_quantity" CHECK ("quantity" >= 0)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_stock_positions_product" ON "stock_positions" ("product_id")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_stock_positions_batch" ON "stock_positions" ("batch_id")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_stock_positions_location" ON "stock_positions" ("stock_location_id")',
    );

    await queryRunner.query(`
      INSERT INTO "permissions" ("id", "code", "description") VALUES
        ('20000000-0000-4000-8000-000000000013', 'stock-positions.read',
         'Consultar posicoes e saldos atuais de estoque')
      ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description"
    `);
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT role."id", permission."id"
      FROM "roles" role
      CROSS JOIN "permissions" permission
      WHERE role."code" = 'ADMIN'
        AND permission."code" = 'stock-positions.read'
      ON CONFLICT DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "role_permissions"
      WHERE "permission_id" IN (
        SELECT "id" FROM "permissions" WHERE "code" = 'stock-positions.read'
      )
    `);
    await queryRunner.query(`
      DELETE FROM "permissions"
      WHERE "id" = '20000000-0000-4000-8000-000000000013'
    `);
    await queryRunner.query('DROP TABLE "stock_positions"');
    await queryRunner.query(`
      ALTER TABLE "batches"
      DROP CONSTRAINT "UQ_batches_id_product",
      DROP CONSTRAINT "CHK_batches_expiration",
      DROP CONSTRAINT "CHK_batches_manufacturing_year",
      DROP CONSTRAINT "CHK_batches_encoded_code"
    `);
    await queryRunner.query('ALTER TABLE "batches" ALTER COLUMN "code" TYPE varchar(100)');
    await queryRunner.query('ALTER TABLE "batches" ALTER COLUMN "expiration_date" DROP NOT NULL');
    await queryRunner.query('ALTER TABLE "batches" DROP COLUMN "manufacturing_date"');
  }

  private async migrateExistingBatches(queryRunner: QueryRunner): Promise<void> {
    const result: unknown = await queryRunner.query(
      'SELECT "id", "code", "expiration_date"::text AS "expiration_date" FROM "batches" ORDER BY "id"',
    );
    if (!Array.isArray(result)) {
      throw new Error('Nao foi possivel ler os lotes existentes durante a migration.');
    }

    for (const value of result) {
      const row = this.toLegacyBatch(value);
      const normalizedCode = row.code.trim().toUpperCase();
      const manufacturingDate = this.decodeLegacyCode(normalizedCode, row.id);
      if (!row.expiration_date) {
        throw new Error(
          `O lote ${row.id} nao possui validade. Corrija o dado antes de executar a migration.`,
        );
      }
      if (row.expiration_date < manufacturingDate) {
        throw new Error(
          `O lote ${row.id} possui validade anterior a fabricacao codificada.`,
        );
      }
      await queryRunner.query(
        'UPDATE "batches" SET "code" = $1, "manufacturing_date" = $2 WHERE "id" = $3',
        [normalizedCode, manufacturingDate, row.id],
      );
    }
  }

  private toLegacyBatch(value: unknown): LegacyBatchRow {
    if (!value || typeof value !== 'object') {
      throw new Error('Foi encontrado um lote legado em formato inesperado.');
    }
    const row = value as Record<string, unknown>;
    if (
      typeof row.id !== 'string'
      || typeof row.code !== 'string'
      || (row.expiration_date !== null && typeof row.expiration_date !== 'string')
    ) {
      throw new Error('Foi encontrado um lote legado com campos invalidos.');
    }
    return {
      id: row.id,
      code: row.code,
      expiration_date: row.expiration_date,
    };
  }

  private decodeLegacyCode(code: string, id: string): string {
    if (!BATCH_CODE_PATTERN.test(code)) {
      throw new Error(
        `O lote ${id} usa codigo anterior ao padrao CONSERVADI. Corrija-o antes da migration.`,
      );
    }
    const digits = [...code].map((character) => DIGIT_LETTERS.indexOf(character)).join('');
    const day = Number(digits.slice(0, 2));
    const month = Number(digits.slice(2, 4));
    const year = 2000 + Number(digits.slice(4, 6));
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year
      || date.getUTCMonth() !== month - 1
      || date.getUTCDate() !== day
    ) {
      throw new Error(`O lote ${id} codifica uma data de fabricacao inexistente.`);
    }
    return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  }
}
