import { MigrationInterface, QueryRunner } from 'typeorm';

export class ShipmentSenderCancellation1790294400000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      DROP TRIGGER shipment_immutable ON shipments;
      DROP FUNCTION protect_shipment_history();
      ALTER TABLE shipments DROP CONSTRAINT shipment_separation_state;
      ALTER TABLE shipments ADD CONSTRAINT shipment_separation_state CHECK (
        (status = 'AGUARDANDO_RECEBIMENTO' AND decided_by_id IS NULL AND decided_at IS NULL AND refusal_reason IS NULL AND received_by_id IS NULL AND received_at IS NULL AND separation_started_at IS NULL AND separation_expires_at IS NULL AND separation_completed_at IS NULL)
        OR (status = 'EM_SEPARACAO' AND decided_by_id IS NULL AND decided_at IS NULL AND refusal_reason IS NULL AND received_by_id IS NOT NULL AND received_at IS NOT NULL AND separation_started_at IS NOT NULL AND separation_expires_at IS NOT NULL AND separation_completed_at IS NULL)
        OR (status = 'CONFIRMADO' AND decided_by_id IS NOT NULL AND decided_at IS NOT NULL AND refusal_reason IS NULL)
        OR (status IN ('RECUSADO','CANCELADO') AND decided_by_id IS NOT NULL AND decided_at IS NOT NULL AND refusal_reason IS NOT NULL AND length(trim(refusal_reason)) > 0)
      );
      CREATE OR REPLACE FUNCTION protect_shipment_history() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP = 'DELETE'
          OR OLD.status NOT IN ('AGUARDANDO_RECEBIMENTO','EM_SEPARACAO')
          OR NEW.status = 'AGUARDANDO_RECEBIMENTO'
          OR (OLD.status = 'AGUARDANDO_RECEBIMENTO' AND NEW.status NOT IN ('EM_SEPARACAO','CONFIRMADO','RECUSADO','CANCELADO'))
          OR (OLD.status = 'EM_SEPARACAO' AND NEW.status <> 'CONFIRMADO')
          OR (to_jsonb(NEW) - ARRAY['status','decided_by_id','decided_at','refusal_reason','received_by_id','received_at','separation_started_at','separation_expires_at','separation_completed_at'])
             IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','decided_by_id','decided_at','refusal_reason','received_by_id','received_at','separation_started_at','separation_expires_at','separation_completed_at']) THEN
          RAISE EXCEPTION 'Envio imutavel: somente transicoes operacionais permitidas';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER shipment_immutable BEFORE UPDATE OR DELETE ON shipments
        FOR EACH ROW EXECUTE FUNCTION protect_shipment_history();
      CREATE INDEX shipments_status_created_idx ON shipments(status, created_at DESC);
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    const canceled = await runner.query("SELECT 1 FROM shipments WHERE status = 'CANCELADO' LIMIT 1") as unknown[];
    if (canceled.length) throw new Error('Existem envios cancelados: rollback destrutivo nao permitido.');
    await runner.query(`
      DROP INDEX shipments_status_created_idx;
      DROP TRIGGER shipment_immutable ON shipments;
      DROP FUNCTION protect_shipment_history();
      ALTER TABLE shipments DROP CONSTRAINT shipment_separation_state;
      ALTER TABLE shipments ADD CONSTRAINT shipment_separation_state CHECK (
        (status = 'AGUARDANDO_RECEBIMENTO' AND decided_by_id IS NULL AND decided_at IS NULL AND refusal_reason IS NULL AND received_by_id IS NULL AND received_at IS NULL AND separation_started_at IS NULL AND separation_expires_at IS NULL AND separation_completed_at IS NULL)
        OR (status = 'EM_SEPARACAO' AND decided_by_id IS NULL AND decided_at IS NULL AND refusal_reason IS NULL AND received_by_id IS NOT NULL AND received_at IS NOT NULL AND separation_started_at IS NOT NULL AND separation_expires_at IS NOT NULL AND separation_completed_at IS NULL)
        OR (status = 'CONFIRMADO' AND decided_by_id IS NOT NULL AND decided_at IS NOT NULL AND refusal_reason IS NULL)
        OR (status = 'RECUSADO' AND decided_by_id IS NOT NULL AND decided_at IS NOT NULL AND refusal_reason IS NOT NULL AND length(trim(refusal_reason)) > 0)
      );
      CREATE OR REPLACE FUNCTION protect_shipment_history() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP = 'DELETE'
          OR OLD.status NOT IN ('AGUARDANDO_RECEBIMENTO','EM_SEPARACAO')
          OR NEW.status = 'AGUARDANDO_RECEBIMENTO'
          OR (OLD.status = 'AGUARDANDO_RECEBIMENTO' AND NEW.status NOT IN ('EM_SEPARACAO','CONFIRMADO','RECUSADO'))
          OR (OLD.status = 'EM_SEPARACAO' AND NEW.status <> 'CONFIRMADO')
          OR (to_jsonb(NEW) - ARRAY['status','decided_by_id','decided_at','refusal_reason','received_by_id','received_at','separation_started_at','separation_expires_at','separation_completed_at'])
             IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','decided_by_id','decided_at','refusal_reason','received_by_id','received_at','separation_started_at','separation_expires_at','separation_completed_at']) THEN
          RAISE EXCEPTION 'Envio imutavel: somente transicoes operacionais permitidas';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER shipment_immutable BEFORE UPDATE OR DELETE ON shipments
        FOR EACH ROW EXECUTE FUNCTION protect_shipment_history();
    `);
  }
}
