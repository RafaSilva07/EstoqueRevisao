import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProductManagementAllRoles1790380800000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      INSERT INTO role_permissions(role_id, permission_id)
      SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
      WHERE r.code IN ('REVISAO', 'PRODUCAO', 'EXPEDICAO', 'PCP')
        AND p.code IN ('products.create', 'products.update')
      ON CONFLICT DO NOTHING
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`
      DELETE FROM role_permissions rp
      USING roles r, permissions p
      WHERE rp.role_id = r.id AND rp.permission_id = p.id
        AND r.code IN ('REVISAO', 'PRODUCAO', 'EXPEDICAO', 'PCP')
        AND p.code IN ('products.create', 'products.update')
    `);
  }
}
