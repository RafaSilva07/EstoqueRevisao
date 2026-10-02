import { MigrationInterface, QueryRunner } from 'typeorm';

export class PermissionPresets1791244800000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE roles ADD COLUMN permission_version integer NOT NULL DEFAULT 1
        CHECK (permission_version > 0);
      INSERT INTO permissions(id, code, description) VALUES
        (gen_random_uuid(), 'movements.external-entry', 'Entrada direta na Revisão'),
        (gen_random_uuid(), 'movements.external-exit', 'Saída direta da Revisão'),
        (gen_random_uuid(), 'movements.transfer', 'Transferência interna'),
        (gen_random_uuid(), 'movements.review', 'Revisar produtos'),
        (gen_random_uuid(), 'products.manage-status', 'Inativar e reativar produtos'),
        (gen_random_uuid(), 'product-conversions.manage-status', 'Inativar e reativar conversões'),
        (gen_random_uuid(), 'stocks.manage-status', 'Inativar e reativar locais');
      INSERT INTO role_permissions(role_id, permission_id)
      SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
      WHERE (r.code = 'ADMIN' AND p.code IN (
        'movements.external-entry', 'movements.external-exit', 'movements.transfer', 'movements.review',
        'products.manage-status', 'product-conversions.manage-status', 'stocks.manage-status'))
        OR (r.code IN ('REVISAO', 'ADMIN_REVISAO_EXPEDICAO') AND p.code IN ('movements.transfer', 'movements.review'))
        OR (p.code = 'products.manage-status' AND EXISTS (
          SELECT 1 FROM role_permissions rp JOIN permissions old ON old.id = rp.permission_id
          WHERE rp.role_id = r.id AND old.code = 'products.update'))
      ON CONFLICT DO NOTHING;
      CREATE TABLE user_permissions (
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE RESTRICT,
        preset_allowed boolean NOT NULL DEFAULT false,
        override boolean,
        PRIMARY KEY (user_id, permission_id)
      );
      CREATE INDEX "IDX_user_permissions_permission" ON user_permissions(permission_id);
      INSERT INTO user_permissions(user_id, permission_id, preset_allowed)
      SELECT u.id, p.id, EXISTS (
        SELECT 1 FROM user_roles ur JOIN role_permissions rp ON rp.role_id = ur.role_id
        WHERE ur.user_id = u.id AND rp.permission_id = p.id
      ) FROM users u CROSS JOIN permissions p;
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    const customized = await runner.query(`SELECT 1 FROM user_permissions WHERE override IS NOT NULL
      UNION ALL SELECT 1 FROM roles WHERE permission_version > 1 LIMIT 1`) as unknown[];
    if (customized.length) throw new Error('Há permissões/presets personalizados. Reconcilie os acessos antes de reverter para o modelo anterior.');
    await runner.query(`
      DROP TABLE user_permissions;
      DELETE FROM permissions WHERE code IN ('movements.external-entry', 'movements.external-exit',
        'movements.transfer', 'movements.review', 'products.manage-status', 'product-conversions.manage-status', 'stocks.manage-status');
      ALTER TABLE roles DROP COLUMN permission_version;
    `);
  }
}
