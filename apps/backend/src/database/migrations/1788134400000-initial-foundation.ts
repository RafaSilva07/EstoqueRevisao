import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialFoundation1788134400000 implements MigrationInterface {
  name = 'InitialFoundation1788134400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL,
        "username" varchar(100) NOT NULL,
        "password_hash" varchar(255) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'ACTIVE',
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_users" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_users_username" CHECK (char_length(trim("username")) BETWEEN 1 AND 100),
        CONSTRAINT "CHK_users_password_hash" CHECK ("password_hash" LIKE '$argon2id$%'),
        CONSTRAINT "CHK_users_status" CHECK ("status" IN ('ACTIVE', 'INACTIVE'))
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "UQ_users_username_ci" ON "users" (LOWER("username"))',
    );

    await queryRunner.query(`
      CREATE TABLE "roles" (
        "id" uuid NOT NULL,
        "code" varchar(60) NOT NULL,
        "name" varchar(120) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_roles" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_roles_code" UNIQUE ("code"),
        CONSTRAINT "CHK_roles_code" CHECK (char_length(trim("code")) > 0),
        CONSTRAINT "CHK_roles_name" CHECK (char_length(trim("name")) > 0)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "permissions" (
        "id" uuid NOT NULL,
        "code" varchar(120) NOT NULL,
        "description" varchar(255) NOT NULL,
        CONSTRAINT "PK_permissions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_permissions_code" UNIQUE ("code"),
        CONSTRAINT "CHK_permissions_code" CHECK (char_length(trim("code")) > 0),
        CONSTRAINT "CHK_permissions_description" CHECK (char_length(trim("description")) > 0)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "user_roles" (
        "user_id" uuid NOT NULL,
        "role_id" uuid NOT NULL,
        CONSTRAINT "PK_user_roles" PRIMARY KEY ("user_id", "role_id"),
        CONSTRAINT "FK_user_roles_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_roles_role" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query('CREATE INDEX "IDX_user_roles_role" ON "user_roles" ("role_id")');

    await queryRunner.query(`
      CREATE TABLE "role_permissions" (
        "role_id" uuid NOT NULL,
        "permission_id" uuid NOT NULL,
        CONSTRAINT "PK_role_permissions" PRIMARY KEY ("role_id", "permission_id"),
        CONSTRAINT "FK_role_permissions_role" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_role_permissions_permission" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_role_permissions_permission" ON "role_permissions" ("permission_id")',
    );

    await queryRunner.query(`
      CREATE TABLE "auth_sessions" (
        "id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "refresh_token_hash" char(64) NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "revoked_at" timestamptz,
        "ip_address" inet,
        "user_agent" varchar(500),
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "last_used_at" timestamptz,
        CONSTRAINT "PK_auth_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_auth_sessions_refresh_hash" UNIQUE ("refresh_token_hash"),
        CONSTRAINT "FK_auth_sessions_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_auth_sessions_refresh_hash" CHECK ("refresh_token_hash" ~ '^[a-f0-9]{64}$'),
        CONSTRAINT "CHK_auth_sessions_expiry" CHECK ("expires_at" > "created_at")
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_auth_sessions_user_active" ON "auth_sessions" ("user_id", "expires_at") WHERE "revoked_at" IS NULL',
    );

    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id" uuid NOT NULL,
        "user_id" uuid,
        "action" varchar(100) NOT NULL,
        "entity_type" varchar(100) NOT NULL,
        "entity_id" varchar(150),
        "result" varchar(30) NOT NULL,
        "old_values" jsonb,
        "new_values" jsonb,
        "ip_address" inet,
        "user_agent" varchar(500),
        "request_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_audit_logs_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_audit_logs_action" CHECK (char_length(trim("action")) > 0),
        CONSTRAINT "CHK_audit_logs_entity_type" CHECK (char_length(trim("entity_type")) > 0),
        CONSTRAINT "CHK_audit_logs_result" CHECK (char_length(trim("result")) > 0)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_audit_logs_user_created" ON "audit_logs" ("user_id", "created_at" DESC)',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_audit_logs_entity_created" ON "audit_logs" ("entity_type", "entity_id", "created_at" DESC)',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_audit_logs_request" ON "audit_logs" ("request_id")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "audit_logs"');
    await queryRunner.query('DROP TABLE "auth_sessions"');
    await queryRunner.query('DROP TABLE "role_permissions"');
    await queryRunner.query('DROP TABLE "user_roles"');
    await queryRunner.query('DROP TABLE "permissions"');
    await queryRunner.query('DROP TABLE "roles"');
    await queryRunner.query('DROP TABLE "users"');
  }
}
