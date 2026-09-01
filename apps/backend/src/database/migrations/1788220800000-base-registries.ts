import { MigrationInterface, QueryRunner } from 'typeorm';

export class BaseRegistries1788220800000 implements MigrationInterface {
  name = 'BaseRegistries1788220800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "products" (
        "id" uuid NOT NULL,
        "code" varchar(60) NOT NULL,
        "name" varchar(200) NOT NULL,
        "default_unit" varchar(20) NOT NULL,
        "active" boolean NOT NULL DEFAULT true,
        "created_by" uuid NOT NULL,
        "updated_by" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_products" PRIMARY KEY ("id"),
        CONSTRAINT "FK_products_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_products_updated_by" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_products_code" CHECK (char_length(trim("code")) BETWEEN 1 AND 60),
        CONSTRAINT "CHK_products_name" CHECK (char_length(trim("name")) BETWEEN 1 AND 200),
        CONSTRAINT "CHK_products_default_unit" CHECK (char_length(trim("default_unit")) BETWEEN 1 AND 20)
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "UQ_products_code_ci" ON "products" (LOWER("code"))',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_products_active_name" ON "products" ("active", LOWER("name"))',
    );

    await queryRunner.query(`
      CREATE TABLE "batches" (
        "id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "code" varchar(100) NOT NULL,
        "expiration_date" date,
        "created_by" uuid NOT NULL,
        "updated_by" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_batches" PRIMARY KEY ("id"),
        CONSTRAINT "FK_batches_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_batches_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_batches_updated_by" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_batches_code" CHECK (char_length(trim("code")) BETWEEN 1 AND 100)
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "UQ_batches_product_code_ci" ON "batches" ("product_id", LOWER("code"))',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_batches_product_expiration" ON "batches" ("product_id", "expiration_date")',
    );

    await queryRunner.query(`
      CREATE TABLE "product_unit_conversions" (
        "id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "from_unit" varchar(20) NOT NULL,
        "to_unit" varchar(20) NOT NULL,
        "factor" numeric(18,6) NOT NULL,
        "active" boolean NOT NULL DEFAULT true,
        "created_by" uuid NOT NULL,
        "updated_by" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_product_unit_conversions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_product_unit_conversions_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_product_unit_conversions_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_product_unit_conversions_updated_by" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_product_unit_conversions_from" CHECK (char_length(trim("from_unit")) BETWEEN 1 AND 20),
        CONSTRAINT "CHK_product_unit_conversions_to" CHECK (char_length(trim("to_unit")) BETWEEN 1 AND 20),
        CONSTRAINT "CHK_product_unit_conversions_units" CHECK (LOWER("from_unit") <> LOWER("to_unit")),
        CONSTRAINT "CHK_product_unit_conversions_factor" CHECK ("factor" > 0)
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "UQ_product_unit_conversions_units_ci" ON "product_unit_conversions" ("product_id", LOWER("from_unit"), LOWER("to_unit"))',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_product_unit_conversions_product_active" ON "product_unit_conversions" ("product_id", "active")',
    );

    await queryRunner.query(`
      CREATE TABLE "stock_locations" (
        "id" uuid NOT NULL,
        "code" varchar(60) NOT NULL,
        "name" varchar(150) NOT NULL,
        "description" varchar(255),
        "kind" varchar(20) NOT NULL,
        "parent_id" uuid,
        "active" boolean NOT NULL DEFAULT true,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_stock_locations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_stock_locations_parent" FOREIGN KEY ("parent_id") REFERENCES "stock_locations"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_stock_locations_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_stock_locations_updated_by" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_stock_locations_code" CHECK (char_length(trim("code")) BETWEEN 1 AND 60),
        CONSTRAINT "CHK_stock_locations_name" CHECK (char_length(trim("name")) BETWEEN 1 AND 150),
        CONSTRAINT "CHK_stock_locations_kind" CHECK ("kind" IN ('STOCK', 'SUBSTOCK', 'EXTERNAL')),
        CONSTRAINT "CHK_stock_locations_parent_kind" CHECK (("kind" = 'SUBSTOCK' AND "parent_id" IS NOT NULL) OR ("kind" IN ('STOCK', 'EXTERNAL') AND "parent_id" IS NULL)),
        CONSTRAINT "CHK_stock_locations_not_self_parent" CHECK ("parent_id" IS NULL OR "parent_id" <> "id")
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "UQ_stock_locations_code_ci" ON "stock_locations" (LOWER("code"))',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_stock_locations_parent" ON "stock_locations" ("parent_id")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_stock_locations_kind_active" ON "stock_locations" ("kind", "active")',
    );

    await queryRunner.query(`
      INSERT INTO "stock_locations" ("id", "code", "name", "description", "kind", "parent_id") VALUES
        ('10000000-0000-4000-8000-000000000001', 'REVISAO', 'Estoque Revisão', 'Estoque principal do setor de Revisão.', 'STOCK', NULL),
        ('10000000-0000-4000-8000-000000000002', 'REVISAR', 'Revisar', 'Produtos recebidos e aguardando ou passando pelo processo de revisão.', 'SUBSTOCK', '10000000-0000-4000-8000-000000000001'),
        ('10000000-0000-4000-8000-000000000003', 'LATA_BOA', 'Lata Boa', 'Produtos aprovados na revisão.', 'SUBSTOCK', '10000000-0000-4000-8000-000000000001'),
        ('10000000-0000-4000-8000-000000000004', 'VAREJO', 'Varejo', 'Produtos destinados ao varejo.', 'SUBSTOCK', '10000000-0000-4000-8000-000000000001'),
        ('10000000-0000-4000-8000-000000000005', 'TUF', 'TUF', 'Destino final operacional com registros preservados.', 'SUBSTOCK', '10000000-0000-4000-8000-000000000001'),
        ('10000000-0000-4000-8000-000000000006', 'EXPEDICAO', 'Expedição', 'Origem ou destino externo participante das movimentações.', 'EXTERNAL', NULL),
        ('10000000-0000-4000-8000-000000000007', 'PRODUCAO', 'Produção', 'Origem externa participante das movimentações.', 'EXTERNAL', NULL)
    `);

    await queryRunner.query(`
      INSERT INTO "roles" ("id", "code", "name") VALUES
        ('30000000-0000-4000-8000-000000000001', 'ADMIN', 'Administrador')
      ON CONFLICT ("code") DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "permissions" ("id", "code", "description") VALUES
        ('20000000-0000-4000-8000-000000000001', 'products.read', 'Consultar produtos'),
        ('20000000-0000-4000-8000-000000000002', 'products.create', 'Cadastrar produtos'),
        ('20000000-0000-4000-8000-000000000003', 'products.update', 'Alterar e ativar/inativar produtos'),
        ('20000000-0000-4000-8000-000000000004', 'batches.read', 'Consultar lotes'),
        ('20000000-0000-4000-8000-000000000005', 'batches.create', 'Cadastrar lotes'),
        ('20000000-0000-4000-8000-000000000006', 'batches.update', 'Alterar lotes'),
        ('20000000-0000-4000-8000-000000000007', 'product-conversions.read', 'Consultar conversões de unidade'),
        ('20000000-0000-4000-8000-000000000008', 'product-conversions.create', 'Cadastrar conversões de unidade'),
        ('20000000-0000-4000-8000-000000000009', 'product-conversions.update', 'Alterar conversões de unidade'),
        ('20000000-0000-4000-8000-000000000010', 'stocks.read', 'Consultar estoques e locais lógicos'),
        ('20000000-0000-4000-8000-000000000011', 'stocks.create', 'Cadastrar estoques e locais lógicos'),
        ('20000000-0000-4000-8000-000000000012', 'stocks.update', 'Alterar estoques e locais lógicos')
      ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description"
    `);

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT role."id", permission."id"
      FROM "roles" role
      CROSS JOIN "permissions" permission
      WHERE role."code" = 'ADMIN'
        AND permission."code" IN (
          'products.read', 'products.create', 'products.update',
          'batches.read', 'batches.create', 'batches.update',
          'product-conversions.read', 'product-conversions.create', 'product-conversions.update',
          'stocks.read', 'stocks.create', 'stocks.update'
        )
      ON CONFLICT DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "role_permissions"
      WHERE "permission_id" IN (
        SELECT "id" FROM "permissions"
        WHERE "code" IN (
          'products.read', 'products.create', 'products.update',
          'batches.read', 'batches.create', 'batches.update',
          'product-conversions.read', 'product-conversions.create', 'product-conversions.update',
          'stocks.read', 'stocks.create', 'stocks.update'
        )
      )
    `);
    await queryRunner.query(`
      DELETE FROM "permissions"
      WHERE "id"::text LIKE '20000000-0000-4000-8000-%'
    `);
    await queryRunner.query(`
      DELETE FROM "roles"
      WHERE "id" = '30000000-0000-4000-8000-000000000001'
    `);
    await queryRunner.query('DROP TABLE "stock_locations"');
    await queryRunner.query('DROP TABLE "product_unit_conversions"');
    await queryRunner.query('DROP TABLE "batches"');
    await queryRunner.query('DROP TABLE "products"');
  }
}
