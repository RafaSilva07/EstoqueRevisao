-- Aplicacao manual das migrations pendentes da etapa 71 pelo SQL Editor.
-- Fonte oficial: apps/backend/src/database/migrations/1791331200000-*.ts
-- e 1791417600000-*.ts. Nao substitui o fluxo habitual do TypeORM.
-- Selecione o projeto correto, tenha backup e execute o arquivo INTEIRO
-- em horario de baixo uso, sem migration:run simultaneo.
-- Nao exclui registros nem altera saldos. Registro e DDL sao atomicos.
-- Se falhar, nao execute os INSERTs de schema_migrations separadamente.

BEGIN;
SET LOCAL search_path = public;
SET LOCAL lock_timeout = '5s';
LOCK TABLE schema_migrations IN SHARE ROW EXCLUSIVE MODE;

DO $prerequisites$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE name = 'PermissionPresets1791244800000')
    OR NOT EXISTS (SELECT 1 FROM schema_migrations WHERE name = 'ShipmentSenderCancellation1790294400000')
    OR NOT EXISTS (SELECT 1 FROM schema_migrations WHERE name = 'MovementRecords1790726400000') THEN
    RAISE EXCEPTION 'Migrations anteriores obrigatorias ausentes. Interrompido sem aplicar esta etapa.';
  END IF;
END
$prerequisites$;

DO $apply_drafts$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE name = 'AccountFormDrafts1791331200000') THEN
    EXECUTE $drafts_ddl$
      CREATE TABLE form_drafts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        operational_mode varchar(15) NOT NULL CHECK (operational_mode IN ('ADMIN','REVISAO','PRODUCAO','EXPEDICAO','PCP')),
        form_key varchar(180) NOT NULL CHECK (form_key ~ '^[A-Za-z0-9_:-]+$'), title varchar(120) NOT NULL,
        payload jsonb CHECK (payload IS NULL OR (jsonb_typeof(payload)='object' AND octet_length(payload::text)<=1048576)),
        photos jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(photos)='array' AND jsonb_array_length(photos)<=100),
        version integer NOT NULL CHECK (version>0), updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (user_id,operational_mode,form_key)
      );
      ALTER TABLE form_drafts ENABLE ROW LEVEL SECURITY;
    $drafts_ddl$;
    INSERT INTO schema_migrations ("timestamp", "name")
      VALUES (1791331200000, 'AccountFormDrafts1791331200000');
  END IF;
END
$apply_drafts$;

DO $apply_corrections$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE name = 'AdministrativeShipmentCorrections1791417600000') THEN
    EXECUTE $corrections_ddl$
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
    $corrections_ddl$;
    INSERT INTO schema_migrations ("timestamp", "name")
      VALUES (1791417600000, 'AdministrativeShipmentCorrections1791417600000');
  END IF;
END
$apply_corrections$;

DO $verify$
BEGIN
  IF to_regclass('public.form_drafts') IS NULL
    OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.form_drafts'::regclass AND relrowsecurity)
    OR (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='shipments'
      AND column_name IN ('corrected_from_id', 'canceled_by_id', 'canceled_at', 'cancellation_reason')) <> 4 THEN
    RAISE EXCEPTION 'Estrutura da etapa 71 nao foi validada; transacao revertida.';
  END IF;
END
$verify$;

COMMIT;

SELECT name AS migration, 'APLICADA' AS situacao
FROM public.schema_migrations
WHERE name IN ('AccountFormDrafts1791331200000', 'AdministrativeShipmentCorrections1791417600000', 'RecentOperationLookup1791504000000')
ORDER BY "timestamp";
