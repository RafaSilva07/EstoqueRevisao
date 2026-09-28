import { MigrationInterface, QueryRunner } from 'typeorm';

export class AreaAdministrators1790553600000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      UPDATE roles SET name = 'Admin geral' WHERE code = 'ADMIN' AND name = 'Administrador';
      INSERT INTO roles(id, code, name) VALUES
        (gen_random_uuid(), 'ADMIN_REVISAO_EXPEDICAO', 'Admin Revisão e Expedição'),
        (gen_random_uuid(), 'ADMIN_PRODUCAO_PCP', 'Admin Produção e PCP')
      ON CONFLICT (code) DO NOTHING;
      INSERT INTO role_permissions(role_id, permission_id)
      SELECT area.id, rp.permission_id
      FROM roles area
      JOIN roles source ON (
        (area.code = 'ADMIN_REVISAO_EXPEDICAO' AND source.code IN ('REVISAO', 'EXPEDICAO'))
        OR (area.code = 'ADMIN_PRODUCAO_PCP' AND source.code IN ('PRODUCAO', 'PCP'))
      )
      JOIN role_permissions rp ON rp.role_id = source.id
      WHERE area.code IN ('ADMIN_REVISAO_EXPEDICAO', 'ADMIN_PRODUCAO_PCP')
      ON CONFLICT DO NOTHING;
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    const assigned = await runner.query(`
      SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
      WHERE r.code IN ('ADMIN_REVISAO_EXPEDICAO', 'ADMIN_PRODUCAO_PCP') LIMIT 1
    `) as unknown[];
    if (assigned.length) throw new Error('Administradores de área atribuídos a usuários: remova os vínculos antes de reverter.');
    await runner.query("DELETE FROM roles WHERE code IN ('ADMIN_REVISAO_EXPEDICAO', 'ADMIN_PRODUCAO_PCP')");
    await runner.query("UPDATE roles SET name = 'Administrador' WHERE code = 'ADMIN' AND name = 'Admin geral'");
  }
}
