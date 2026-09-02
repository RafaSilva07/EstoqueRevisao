import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExternalEntryMovements1788393600000 implements MigrationInterface {
  name = 'ExternalEntryMovements1788393600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "movements" (
        "id" uuid NOT NULL,
        "request_key" uuid NOT NULL,
        "type" varchar(40) NOT NULL,
        "origin_location_id" uuid NOT NULL,
        "destination_location_id" uuid NOT NULL,
        "responsible_user_id" uuid NOT NULL,
        "occurred_at" timestamptz NOT NULL,
        "status" varchar(30) NOT NULL,
        "observation" varchar(1000),
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_movements" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_movements_request_key" UNIQUE ("request_key"),
        CONSTRAINT "FK_movements_origin" FOREIGN KEY ("origin_location_id") REFERENCES "stock_locations"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_movements_destination" FOREIGN KEY ("destination_location_id") REFERENCES "stock_locations"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_movements_responsible" FOREIGN KEY ("responsible_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_movements_type" CHECK (char_length(trim("type")) > 0),
        CONSTRAINT "CHK_movements_status" CHECK (char_length(trim("status")) > 0),
        CONSTRAINT "CHK_movements_locations" CHECK ("origin_location_id" <> "destination_location_id")
      )
    `);
    await queryRunner.query('CREATE INDEX "IDX_movements_occurred_at" ON "movements" ("occurred_at" DESC)');
    await queryRunner.query('CREATE INDEX "IDX_movements_type_occurred" ON "movements" ("type", "occurred_at" DESC)');
    await queryRunner.query('CREATE INDEX "IDX_movements_origin_occurred" ON "movements" ("origin_location_id", "occurred_at" DESC)');
    await queryRunner.query('CREATE INDEX "IDX_movements_destination_occurred" ON "movements" ("destination_location_id", "occurred_at" DESC)');

    await queryRunner.query(`
      CREATE TABLE "movement_items" (
        "id" uuid NOT NULL,
        "movement_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "batch_id" uuid NOT NULL,
        "quantity" numeric(18,6) NOT NULL,
        CONSTRAINT "PK_movement_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_movement_items_movement" FOREIGN KEY ("movement_id") REFERENCES "movements"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_movement_items_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_movement_items_batch" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_movement_items_batch_product" FOREIGN KEY ("batch_id", "product_id") REFERENCES "batches"("id", "product_id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_movement_items_quantity" CHECK ("quantity" > 0)
      )
    `);
    await queryRunner.query('CREATE INDEX "IDX_movement_items_movement" ON "movement_items" ("movement_id")');
    await queryRunner.query('CREATE INDEX "IDX_movement_items_product" ON "movement_items" ("product_id")');
    await queryRunner.query('CREATE INDEX "IDX_movement_items_batch" ON "movement_items" ("batch_id")');

    await queryRunner.query(`
      INSERT INTO "permissions" ("id", "code", "description") VALUES
        ('20000000-0000-4000-8000-000000000014', 'movements.read', 'Consultar historico e detalhes de movimentacoes'),
        ('20000000-0000-4000-8000-000000000015', 'movements.create', 'Registrar entradas externas de estoque')
      ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description"
    `);
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT role."id", permission."id"
      FROM "roles" role CROSS JOIN "permissions" permission
      WHERE role."code" = 'ADMIN' AND permission."code" IN ('movements.read', 'movements.create')
      ON CONFLICT DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "role_permissions" WHERE "permission_id" IN (SELECT "id" FROM "permissions" WHERE "code" IN ('movements.read', 'movements.create'))`);
    await queryRunner.query(`DELETE FROM "permissions" WHERE "id" IN ('20000000-0000-4000-8000-000000000014', '20000000-0000-4000-8000-000000000015')`);
    await queryRunner.query('DROP TABLE "movement_items"');
    await queryRunner.query('DROP TABLE "movements"');
  }
}
