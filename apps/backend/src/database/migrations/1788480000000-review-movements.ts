import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReviewMovements1788480000000 implements MigrationInterface {
  name = 'ReviewMovements1788480000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "stock_locations"
      ADD COLUMN "review_role" varchar(20)
    `);
    await queryRunner.query(`
      ALTER TABLE "stock_locations"
      ADD CONSTRAINT "CHK_stock_locations_review_role"
      CHECK ("review_role" IS NULL OR ("kind" = 'SUBSTOCK' AND "review_role" IN ('SOURCE', 'DESTINATION')))
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_stock_locations_review_source"
      ON "stock_locations" ("review_role")
      WHERE "review_role" = 'SOURCE'
    `);
    await queryRunner.query(`
      UPDATE "stock_locations"
      SET "review_role" = CASE "id"
        WHEN '10000000-0000-4000-8000-000000000002' THEN 'SOURCE'
        WHEN '10000000-0000-4000-8000-000000000003' THEN 'DESTINATION'
        WHEN '10000000-0000-4000-8000-000000000004' THEN 'DESTINATION'
        WHEN '10000000-0000-4000-8000-000000000005' THEN 'DESTINATION'
      END
      WHERE "id" IN (
        '10000000-0000-4000-8000-000000000002',
        '10000000-0000-4000-8000-000000000003',
        '10000000-0000-4000-8000-000000000004',
        '10000000-0000-4000-8000-000000000005'
      )
    `);

    await queryRunner.query('ALTER TABLE "movements" DROP CONSTRAINT "CHK_movements_locations"');
    await queryRunner.query('ALTER TABLE "movements" ALTER COLUMN "destination_location_id" DROP NOT NULL');
    await queryRunner.query(`
      ALTER TABLE "movements"
      ADD CONSTRAINT "CHK_movements_locations" CHECK (
        ("type" = 'REVISAO' AND "destination_location_id" IS NULL)
        OR
        ("type" <> 'REVISAO' AND "destination_location_id" IS NOT NULL AND "origin_location_id" <> "destination_location_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "movement_item_distributions" (
        "id" uuid NOT NULL,
        "movement_item_id" uuid NOT NULL,
        "destination_location_id" uuid NOT NULL,
        "quantity" numeric(18,6) NOT NULL,
        CONSTRAINT "PK_movement_item_distributions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_movement_item_distributions_item_destination" UNIQUE ("movement_item_id", "destination_location_id"),
        CONSTRAINT "FK_movement_item_distributions_item" FOREIGN KEY ("movement_item_id") REFERENCES "movement_items"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_movement_item_distributions_destination" FOREIGN KEY ("destination_location_id") REFERENCES "stock_locations"("id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_movement_item_distributions_quantity" CHECK ("quantity" > 0)
      )
    `);
    await queryRunner.query('CREATE INDEX "IDX_movement_item_distributions_item" ON "movement_item_distributions" ("movement_item_id")');
    await queryRunner.query('CREATE INDEX "IDX_movement_item_distributions_destination" ON "movement_item_distributions" ("destination_location_id")');
    await queryRunner.query(`
      UPDATE "permissions"
      SET "description" = 'Registrar movimentacoes e revisoes de estoque'
      WHERE "code" = 'movements.create'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "movement_item_distributions"');
    await queryRunner.query('ALTER TABLE "movements" DROP CONSTRAINT "CHK_movements_locations"');
    await queryRunner.query('ALTER TABLE "movements" ALTER COLUMN "destination_location_id" SET NOT NULL');
    await queryRunner.query(`
      ALTER TABLE "movements"
      ADD CONSTRAINT "CHK_movements_locations" CHECK ("origin_location_id" <> "destination_location_id")
    `);
    await queryRunner.query('DROP INDEX "UQ_stock_locations_review_source"');
    await queryRunner.query('ALTER TABLE "stock_locations" DROP CONSTRAINT "CHK_stock_locations_review_role"');
    await queryRunner.query('ALTER TABLE "stock_locations" DROP COLUMN "review_role"');
    await queryRunner.query(`
      UPDATE "permissions"
      SET "description" = 'Registrar entradas externas de estoque'
      WHERE "code" = 'movements.create'
    `);
  }
}
