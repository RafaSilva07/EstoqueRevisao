import { MigrationInterface, QueryRunner } from 'typeorm';

export class TransferDestinationBatches1788566400000 implements MigrationInterface {
  name = 'TransferDestinationBatches1788566400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "movement_items"
      ADD COLUMN "destination_batch_id" uuid
    `);
    await queryRunner.query(`
      UPDATE "movement_items" item
      SET "destination_batch_id" = item."batch_id"
      FROM "movements" movement
      WHERE movement."id" = item."movement_id"
        AND movement."type" = 'TRANSFERENCIA_INTERNA'
    `);
    await queryRunner.query(`
      ALTER TABLE "movement_items"
      ADD CONSTRAINT "FK_movement_items_destination_batch"
        FOREIGN KEY ("destination_batch_id") REFERENCES "batches"("id") ON DELETE RESTRICT,
      ADD CONSTRAINT "FK_movement_items_destination_batch_product"
        FOREIGN KEY ("destination_batch_id", "product_id") REFERENCES "batches"("id", "product_id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_movement_items_destination_batch"
      ON "movement_items" ("destination_batch_id")
    `);

    await queryRunner.query('ALTER TABLE "movements" DROP CONSTRAINT "CHK_movements_locations"');
    await queryRunner.query(`
      ALTER TABLE "movements"
      ADD CONSTRAINT "CHK_movements_locations" CHECK (
        ("type" = 'REVISAO' AND "destination_location_id" IS NULL)
        OR
        ("type" = 'TRANSFERENCIA_INTERNA' AND "destination_location_id" IS NOT NULL)
        OR
        (
          "type" NOT IN ('REVISAO', 'TRANSFERENCIA_INTERNA')
          AND "destination_location_id" IS NOT NULL
          AND "origin_location_id" <> "destination_location_id"
        )
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "movements" DROP CONSTRAINT "CHK_movements_locations"');
    await queryRunner.query(`
      ALTER TABLE "movements"
      ADD CONSTRAINT "CHK_movements_locations" CHECK (
        ("type" = 'REVISAO' AND "destination_location_id" IS NULL)
        OR
        ("type" <> 'REVISAO' AND "destination_location_id" IS NOT NULL AND "origin_location_id" <> "destination_location_id")
      )
    `);
    await queryRunner.query('DROP INDEX "IDX_movement_items_destination_batch"');
    await queryRunner.query('ALTER TABLE "movement_items" DROP CONSTRAINT "FK_movement_items_destination_batch_product"');
    await queryRunner.query('ALTER TABLE "movement_items" DROP CONSTRAINT "FK_movement_items_destination_batch"');
    await queryRunner.query('ALTER TABLE "movement_items" DROP COLUMN "destination_batch_id"');
  }
}
