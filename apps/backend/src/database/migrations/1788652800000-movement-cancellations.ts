import { MigrationInterface, QueryRunner } from 'typeorm';

export class MovementCancellations1788652800000 implements MigrationInterface {
  name = 'MovementCancellations1788652800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "movements"
      ADD COLUMN "canceled_by_user_id" uuid,
      ADD COLUMN "canceled_at" timestamptz,
      ADD COLUMN "cancellation_reason" varchar(1000),
      ADD CONSTRAINT "FK_movements_canceled_by"
        FOREIGN KEY ("canceled_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query('ALTER TABLE "movements" DROP CONSTRAINT "CHK_movements_status"');
    await queryRunner.query(`
      ALTER TABLE "movements"
      ADD CONSTRAINT "CHK_movements_status"
        CHECK ("status" IN ('EFETIVADA', 'CANCELADA')),
      ADD CONSTRAINT "CHK_movements_cancellation"
        CHECK (
          (
            "status" = 'EFETIVADA'
            AND "canceled_by_user_id" IS NULL
            AND "canceled_at" IS NULL
            AND "cancellation_reason" IS NULL
          )
          OR
          (
            "status" = 'CANCELADA'
            AND "canceled_by_user_id" IS NOT NULL
            AND "canceled_at" IS NOT NULL
            AND "cancellation_reason" IS NOT NULL
            AND char_length(trim("cancellation_reason")) > 0
          )
        )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_movements_canceled_at"
      ON "movements" ("canceled_at" DESC)
      WHERE "canceled_at" IS NOT NULL
    `);
    await queryRunner.query(`
      INSERT INTO "permissions" ("id", "code", "description") VALUES
        ('20000000-0000-4000-8000-000000000016', 'movements.cancel', 'Cancelar e estornar movimentacoes de estoque')
      ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description"
    `);
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT role."id", permission."id"
      FROM "roles" role CROSS JOIN "permissions" permission
      WHERE role."code" = 'ADMIN' AND permission."code" = 'movements.cancel'
      ON CONFLICT DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "role_permissions"
      WHERE "permission_id" = '20000000-0000-4000-8000-000000000016'
    `);
    await queryRunner.query(`
      DELETE FROM "permissions"
      WHERE "id" = '20000000-0000-4000-8000-000000000016'
    `);
    await queryRunner.query('DROP INDEX "IDX_movements_canceled_at"');
    await queryRunner.query('ALTER TABLE "movements" DROP CONSTRAINT "CHK_movements_cancellation"');
    await queryRunner.query('ALTER TABLE "movements" DROP CONSTRAINT "CHK_movements_status"');
    await queryRunner.query(`
      ALTER TABLE "movements"
      ADD CONSTRAINT "CHK_movements_status" CHECK (char_length(trim("status")) > 0)
    `);
    await queryRunner.query('ALTER TABLE "movements" DROP CONSTRAINT "FK_movements_canceled_by"');
    await queryRunner.query(`
      ALTER TABLE "movements"
      DROP COLUMN "cancellation_reason",
      DROP COLUMN "canceled_at",
      DROP COLUMN "canceled_by_user_id"
    `);
  }
}
