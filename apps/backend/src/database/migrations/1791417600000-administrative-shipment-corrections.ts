import { MigrationInterface, QueryRunner } from 'typeorm';
import { ShipmentSenderCancellation1790294400000 } from './1790294400000-shipment-sender-cancellation';

export class AdministrativeShipmentCorrections1791417600000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE shipments
        ADD COLUMN corrected_from_id uuid REFERENCES shipments(id) ON DELETE RESTRICT,
        ADD COLUMN canceled_by_id uuid REFERENCES users(id) ON DELETE RESTRICT,
        ADD COLUMN canceled_at timestamptz,
        ADD COLUMN cancellation_reason varchar(1000),
        ADD CONSTRAINT shipment_correction_not_self CHECK (corrected_from_id IS NULL OR corrected_from_id <> id),
        ADD CONSTRAINT shipment_admin_cancellation CHECK (
          (canceled_by_id IS NULL AND canceled_at IS NULL AND cancellation_reason IS NULL)
          OR (status='CANCELADO' AND canceled_by_id IS NOT NULL AND canceled_at IS NOT NULL AND length(trim(cancellation_reason)) > 0 AND cancellation_reason IS NOT NULL)
        );
      CREATE UNIQUE INDEX shipment_one_correction_idx ON shipments(corrected_from_id) WHERE corrected_from_id IS NOT NULL;
      ALTER TABLE shipments DROP CONSTRAINT shipment_separation_state;
      ALTER TABLE shipments ADD CONSTRAINT shipment_separation_state CHECK (
        (status='AGUARDANDO_RECEBIMENTO' AND decided_by_id IS NULL AND decided_at IS NULL AND refusal_reason IS NULL AND received_by_id IS NULL AND received_at IS NULL AND separation_started_at IS NULL AND separation_expires_at IS NULL AND separation_completed_at IS NULL)
        OR (status='EM_SEPARACAO' AND decided_by_id IS NULL AND decided_at IS NULL AND refusal_reason IS NULL AND received_by_id IS NOT NULL AND received_at IS NOT NULL AND separation_started_at IS NOT NULL AND separation_expires_at IS NOT NULL AND separation_completed_at IS NULL)
        OR (status='CONFIRMADO' AND decided_by_id IS NOT NULL AND decided_at IS NOT NULL AND refusal_reason IS NULL)
        OR (status IN ('RECUSADO','CANCELADO') AND decided_by_id IS NOT NULL AND decided_at IS NOT NULL AND refusal_reason IS NOT NULL AND length(trim(refusal_reason))>0)
        OR (status='CANCELADO' AND canceled_by_id IS NOT NULL AND canceled_at IS NOT NULL AND cancellation_reason IS NOT NULL AND length(trim(cancellation_reason))>0)
      );
      CREATE OR REPLACE FUNCTION protect_shipment_history() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Envio imutavel: exclusao fisica proibida'; END IF;
        IF NEW.status='CANCELADO' AND NEW.canceled_by_id IS NOT NULL AND OLD.status IN ('AGUARDANDO_RECEBIMENTO','EM_SEPARACAO','CONFIRMADO') THEN
          IF EXISTS (SELECT 1 FROM movements m JOIN movement_items i ON i.movement_id=m.id WHERE m.shipment_id=OLD.id AND (m.pcp_execution_status='EXECUTADA' OR i.pcp_execution_status='EXECUTADA')) THEN
            RAISE EXCEPTION 'Envio ja executado no PCP';
          END IF;
          IF (to_jsonb(NEW)-ARRAY['status','canceled_by_id','canceled_at','cancellation_reason'])
            IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','canceled_by_id','canceled_at','cancellation_reason']) THEN
            RAISE EXCEPTION 'Dados originais do envio devem ser preservados';
          END IF;
          RETURN NEW;
        END IF;
        IF OLD.status NOT IN ('AGUARDANDO_RECEBIMENTO','EM_SEPARACAO') OR NEW.status='AGUARDANDO_RECEBIMENTO'
          OR (OLD.status='AGUARDANDO_RECEBIMENTO' AND NEW.status NOT IN ('EM_SEPARACAO','CONFIRMADO','RECUSADO','CANCELADO'))
          OR (OLD.status='EM_SEPARACAO' AND NEW.status<>'CONFIRMADO')
          OR (to_jsonb(NEW)-ARRAY['status','decided_by_id','decided_at','refusal_reason','received_by_id','received_at','separation_started_at','separation_expires_at','separation_completed_at'])
            IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','decided_by_id','decided_at','refusal_reason','received_by_id','received_at','separation_started_at','separation_expires_at','separation_completed_at']) THEN
          RAISE EXCEPTION 'Envio imutavel: somente transicoes operacionais permitidas';
        END IF;
        RETURN NEW;
      END $$;
    `);
  }
  async down(runner: QueryRunner): Promise<void> {
    const used = await runner.query('SELECT 1 FROM shipments WHERE canceled_by_id IS NOT NULL OR corrected_from_id IS NOT NULL LIMIT 1') as unknown[];
    if (used.length) throw new Error('Ha correcoes administrativas: rollback destrutivo proibido.');
    await runner.query('DROP INDEX shipments_status_created_idx;');
    await new ShipmentSenderCancellation1790294400000().up(runner);
    await runner.query(`DROP INDEX shipment_one_correction_idx;
      ALTER TABLE shipments DROP CONSTRAINT shipment_admin_cancellation, DROP CONSTRAINT shipment_correction_not_self,
        DROP COLUMN corrected_from_id, DROP COLUMN canceled_by_id, DROP COLUMN canceled_at, DROP COLUMN cancellation_reason;`);
  }
}
