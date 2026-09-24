import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeparationAndSettings1790035200000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE system_settings (
        key varchar(80) PRIMARY KEY,
        value varchar(500) NOT NULL,
        updated_by_id uuid REFERENCES users(id) ON DELETE RESTRICT,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO system_settings(key, value) VALUES ('immediate_separation_minutes', '180');

      CREATE TABLE review_process_destinations (
        stock_location_id uuid PRIMARY KEY REFERENCES stock_locations(id) ON DELETE RESTRICT,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO review_process_destinations(stock_location_id)
        SELECT id FROM stock_locations WHERE review_role = 'DESTINATION';
      CREATE INDEX review_process_destinations_created_idx ON review_process_destinations(created_at);

      DROP TRIGGER shipment_immutable ON shipments;
      DROP FUNCTION protect_shipment_history();
      DO $$ DECLARE constraint_name text; BEGIN
        SELECT conname INTO constraint_name FROM pg_constraint
        WHERE conrelid = 'shipments'::regclass AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%AGUARDANDO_RECEBIMENTO%';
        IF constraint_name IS NOT NULL THEN EXECUTE format('ALTER TABLE shipments DROP CONSTRAINT %I', constraint_name); END IF;
      END $$;
      ALTER TABLE shipments
        ADD shipment_kind varchar(30) NOT NULL DEFAULT 'NORMAL'
          CHECK (shipment_kind IN ('NORMAL','RETORNO_IMEDIATO')),
        ADD source_shipment_id uuid REFERENCES shipments(id) ON DELETE RESTRICT,
        ADD received_by_id uuid REFERENCES users(id) ON DELETE RESTRICT,
        ADD received_at timestamptz,
        ADD separation_started_at timestamptz,
        ADD separation_expires_at timestamptz,
        ADD separation_completed_at timestamptz,
        ADD CONSTRAINT shipment_separation_state CHECK (
          (status = 'AGUARDANDO_RECEBIMENTO' AND decided_by_id IS NULL AND decided_at IS NULL AND refusal_reason IS NULL AND received_by_id IS NULL AND received_at IS NULL AND separation_started_at IS NULL AND separation_expires_at IS NULL AND separation_completed_at IS NULL)
          OR (status = 'EM_SEPARACAO' AND decided_by_id IS NULL AND decided_at IS NULL AND refusal_reason IS NULL AND received_by_id IS NOT NULL AND received_at IS NOT NULL AND separation_started_at IS NOT NULL AND separation_expires_at IS NOT NULL AND separation_completed_at IS NULL)
          OR (status = 'CONFIRMADO' AND decided_by_id IS NOT NULL AND decided_at IS NOT NULL AND refusal_reason IS NULL)
          OR (status = 'RECUSADO' AND decided_by_id IS NOT NULL AND decided_at IS NOT NULL AND refusal_reason IS NOT NULL AND length(trim(refusal_reason)) > 0)
        ),
        ADD CONSTRAINT shipment_return_link CHECK ((shipment_kind = 'RETORNO_IMEDIATO') = (source_shipment_id IS NOT NULL));
      CREATE UNIQUE INDEX shipment_immediate_return_unique ON shipments(source_shipment_id) WHERE source_shipment_id IS NOT NULL;
      CREATE INDEX shipment_separation_expiration_idx ON shipments(status, separation_expires_at) WHERE status = 'EM_SEPARACAO';

      CREATE TABLE shipment_separation_drafts (
        shipment_item_id uuid PRIMARY KEY REFERENCES shipment_items(id) ON DELETE RESTRICT,
        return_quantity numeric(18,6) NOT NULL DEFAULT 0 CHECK (return_quantity >= 0 AND return_quantity = trunc(return_quantity)),
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
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

      ALTER TABLE movements ADD requires_pcp_execution boolean NOT NULL DEFAULT true;
      CREATE INDEX movements_pcp_required_idx ON movements(requires_pcp_execution, pcp_execution_status, occurred_at);
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    const active = await runner.query("SELECT 1 FROM shipments WHERE status='EM_SEPARACAO' OR shipment_kind='RETORNO_IMEDIATO' LIMIT 1") as unknown[];
    if (active.length) throw new Error('Existem separacoes/retornos: rollback destrutivo nao permitido.');
    await runner.query(`
      DROP INDEX movements_pcp_required_idx;
      ALTER TABLE movements DROP COLUMN requires_pcp_execution;
      DROP TRIGGER shipment_immutable ON shipments;
      DROP FUNCTION protect_shipment_history();
      DROP TABLE shipment_separation_drafts;
      DROP INDEX shipment_separation_expiration_idx;
      DROP INDEX shipment_immediate_return_unique;
      ALTER TABLE shipments DROP CONSTRAINT shipment_return_link, DROP CONSTRAINT shipment_separation_state,
        DROP COLUMN separation_completed_at, DROP COLUMN separation_expires_at, DROP COLUMN separation_started_at,
        DROP COLUMN received_at, DROP COLUMN received_by_id, DROP COLUMN source_shipment_id, DROP COLUMN shipment_kind;
      ALTER TABLE shipments ADD CHECK (
        (status = 'AGUARDANDO_RECEBIMENTO' AND decided_by_id IS NULL AND decided_at IS NULL AND refusal_reason IS NULL)
        OR (status = 'CONFIRMADO' AND decided_by_id IS NOT NULL AND decided_at IS NOT NULL AND refusal_reason IS NULL)
        OR (status = 'RECUSADO' AND decided_by_id IS NOT NULL AND decided_at IS NOT NULL AND refusal_reason IS NOT NULL AND length(trim(refusal_reason)) > 0)
      );
      CREATE OR REPLACE FUNCTION protect_shipment_history() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP = 'DELETE' OR OLD.status <> 'AGUARDANDO_RECEBIMENTO' OR NEW.status = 'AGUARDANDO_RECEBIMENTO'
          OR (to_jsonb(NEW) - ARRAY['status','decided_by_id','decided_at','refusal_reason']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','decided_by_id','decided_at','refusal_reason']) THEN
          RAISE EXCEPTION 'Envio imutavel: somente decisao de recebimento e permitida';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER shipment_immutable BEFORE UPDATE OR DELETE ON shipments FOR EACH ROW EXECUTE FUNCTION protect_shipment_history();
      DROP TABLE review_process_destinations;
      DROP TABLE system_settings;
    `);
  }
}

