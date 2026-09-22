import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReviewOperatorRole1789948800000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      INSERT INTO roles(id, code, name)
        VALUES (gen_random_uuid(), 'REVISAO', 'Revisão operacional');
      INSERT INTO role_permissions(role_id, permission_id)
        SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
        WHERE r.code = 'REVISAO' AND p.code IN (
          'products.read', 'product-conversions.read', 'batches.read',
          'stocks.read', 'stock-positions.read', 'movements.read', 'movements.create',
          'shipments.read', 'shipments.create', 'shipments.decide'
        );
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    const assigned = await runner.query("SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE r.code = 'REVISAO' LIMIT 1") as unknown[];
    if (assigned.length) throw new Error('Perfil Revisão atribuído a usuários: remova os vínculos pela administração antes de reverter.');
    await runner.query("DELETE FROM roles WHERE code = 'REVISAO'");
  }
}
