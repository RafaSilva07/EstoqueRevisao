import { MigrationInterface, QueryRunner } from 'typeorm';

export class PcpMovementExecution1789689600000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE movements
        ADD pcp_execution_status varchar(20) NOT NULL DEFAULT 'PENDENTE',
        ADD pcp_executed_by_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
        ADD pcp_executed_at timestamptz,
        ADD pcp_execution_observation varchar(1000),
        ADD CONSTRAINT movement_pcp_execution_status_valid CHECK (pcp_execution_status IN ('PENDENTE','EXECUTADA')),
        ADD CONSTRAINT movement_pcp_execution_complete CHECK (
          (pcp_execution_status = 'PENDENTE' AND pcp_executed_by_user_id IS NULL AND pcp_executed_at IS NULL AND pcp_execution_observation IS NULL)
          OR (pcp_execution_status = 'EXECUTADA' AND pcp_executed_by_user_id IS NOT NULL AND pcp_executed_at IS NOT NULL)
        );
      CREATE INDEX movements_pcp_queue_idx ON movements(pcp_execution_status, occurred_at, id);
      CREATE INDEX movements_operational_status_date_idx ON movements(status, occurred_at, id);

      INSERT INTO roles(id, code, name) VALUES (gen_random_uuid(), 'PCP', 'PCP') ON CONFLICT (code) DO NOTHING;
      INSERT INTO permissions(id, code, description) VALUES
        (gen_random_uuid(), 'pcp.movements.read', 'Consultar a fila e os detalhes das movimentacoes no PCP'),
        (gen_random_uuid(), 'pcp.movements.execute', 'Marcar movimentacao concluida como executada no PCP')
      ON CONFLICT (code) DO NOTHING;
      INSERT INTO role_permissions(role_id, permission_id)
        SELECT role.id, permission.id FROM roles role CROSS JOIN permissions permission
        WHERE role.code IN ('PCP', 'ADMIN') AND permission.code IN ('pcp.movements.read', 'pcp.movements.execute')
        ON CONFLICT DO NOTHING;
      INSERT INTO role_permissions(role_id, permission_id)
        SELECT role.id, permission.id FROM roles role CROSS JOIN permissions permission
        WHERE role.code = 'PCP' AND permission.code IN ('products.read', 'batches.read', 'stocks.read', 'stock-positions.read', 'shipments.read')
        ON CONFLICT DO NOTHING;
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    const executed = await runner.query("SELECT 1 FROM movements WHERE pcp_execution_status = 'EXECUTADA' LIMIT 1") as unknown[];
    if (executed.length) throw new Error('Existem movimentacoes executadas pelo PCP: rollback destrutivo nao permitido.');
    const users = await runner.query("SELECT 1 FROM user_roles ur INNER JOIN roles r ON r.id = ur.role_id WHERE r.code = 'PCP' LIMIT 1") as unknown[];
    if (users.length) throw new Error('Existem usuarios PCP: remova o perfil antes do rollback.');
    await runner.query(`
      DELETE FROM roles WHERE code = 'PCP';
      DELETE FROM permissions WHERE code IN ('pcp.movements.read', 'pcp.movements.execute');
      DROP INDEX movements_operational_status_date_idx;
      DROP INDEX movements_pcp_queue_idx;
      ALTER TABLE movements DROP CONSTRAINT movement_pcp_execution_complete,
        DROP CONSTRAINT movement_pcp_execution_status_valid,
        DROP COLUMN pcp_execution_observation, DROP COLUMN pcp_executed_at,
        DROP COLUMN pcp_executed_by_user_id, DROP COLUMN pcp_execution_status;
    `);
  }
}
