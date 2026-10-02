-- MODELO DE MANUTENCAO COM PARAMETROS E ROLLBACK POR PADRAO. NAO E UMA MIGRATION.
-- Executado com parametros preenchidos e COMMIT em 02/10/2026; registro em
-- documentos/relatorios/RELATORIO_ETAPA_60_LIMPEZA_BANCO_PRODUCAO.md.
-- Escopo: somente tabelas da aplicacao no schema public. Nao altera auth.*,
-- storage.*, bucket shipment-evidence, roles, permissions, role_permissions,
-- stock_locations, review_process_destinations ou schema_migrations.
--
-- Antes de uma futura execucao:
-- 1. Parar backend, jobs e qualquer escrita; fazer backup verificavel do banco.
-- 2. Criar um ADMIN NOVO com npm run db:user:create (BOOTSTRAP_ROLE_CODE=ADMIN),
--    senha forte via ambiente, nunca neste arquivo. Anotar seu UUID e username.
-- 3. Executar e EXPORTAR a consulta de fotos abaixo; conferir tambem objetos
--    orfaos no bucket. Guardar o manifesto fora do banco antes de limpar as FKs.
-- 4. Revisar stock_locations e valores de system_settings: ambos sao preservados.
-- 5. Substituir os tres parametros da tabela temporaria abaixo. Primeiro testar
--    com ROLLBACK. So apos conferencia independente, trocar ROLLBACK por COMMIT.
--
-- Manifesto de fotos REFERENCIADAS (consulta somente leitura; exportar como CSV):
SELECT 'shipment_items' AS origem, id AS shipment_item_id,
       photo_storage_key AS object_path
FROM public.shipment_items
WHERE photo_storage_key IS NOT NULL
UNION ALL
SELECT 'shipment_item_additional_photos' AS origem, shipment_item_id,
       storage_key AS object_path
FROM public.shipment_item_additional_photos
ORDER BY object_path;

-- Opcional, somente leitura: comparar objetos do bucket com as referencias acima.
-- Objetos sem referencia podem resultar de falha entre upload e compensacao;
-- revisar individualmente antes de inclui-los na limpeza de fotos de teste.
-- WITH refs AS (
--   SELECT photo_storage_key AS key FROM public.shipment_items WHERE photo_storage_key IS NOT NULL
--   UNION SELECT storage_key FROM public.shipment_item_additional_photos
-- )
-- SELECT obj.name FROM storage.objects obj LEFT JOIN refs ON refs.key = obj.name
-- WHERE obj.bucket_id = 'shipment-evidence' AND refs.key IS NULL ORDER BY obj.name;

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '10min';

CREATE TEMP TABLE cleanup_production_parameters (
  admin_id uuid NOT NULL,
  expected_username text NOT NULL,
  storage_manifest_exported boolean NOT NULL
) ON COMMIT DROP;

-- Substituir UUID, username e false somente apos os preparativos acima.
INSERT INTO cleanup_production_parameters
  (admin_id, expected_username, storage_manifest_exported)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'SUBSTITUIR_USERNAME_ADMIN_NOVO', false);

-- Manutencao exclusiva: nao continuar se outra sessao estiver usando as tabelas.
LOCK TABLE
  public.audit_logs, public.auth_sessions, public.batches,
  public.movement_item_distributions, public.movement_items, public.movements,
  public.permissions, public.product_unit_conversions, public.product_unit_options,
  public.products, public.review_process_destinations, public.role_permissions,
  public.roles, public.schema_migrations, public.shipment_item_additional_photos,
  public.shipment_items, public.shipment_separation_drafts, public.shipments,
  public.stock_locations, public.stock_positions, public.system_settings,
  public.user_roles, public.users
IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  v_admin_id uuid;
  v_username text;
  v_manifest_exported boolean;
BEGIN
  SELECT admin_id, expected_username, storage_manifest_exported
  INTO STRICT v_admin_id, v_username, v_manifest_exported
  FROM cleanup_production_parameters;
  IF v_admin_id = '00000000-0000-0000-0000-000000000000'::uuid
     OR v_username = 'SUBSTITUIR_USERNAME_ADMIN_NOVO'
     OR NOT v_manifest_exported THEN
    RAISE EXCEPTION 'Preencha ADMIN novo e confirme exportacao do manifesto de fotos.';
  END IF;
  IF (SELECT count(*) FROM public.users
      WHERE id = v_admin_id AND lower(username) = lower(v_username)
        AND status = 'ACTIVE' AND sector = 'REVISAO') <> 1 THEN
    RAISE EXCEPTION 'ADMIN novo nao corresponde a UUID, username, status e setor esperados.';
  END IF;
  IF (SELECT count(*) FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = v_admin_id) <> 1
     OR NOT EXISTS (
       SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
       WHERE ur.user_id = v_admin_id AND r.code = 'ADMIN'
     ) THEN
    RAISE EXCEPTION 'O usuario preservado precisa possuir somente o perfil ADMIN.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'shipment-evidence') THEN
    RAISE EXCEPTION 'Bucket shipment-evidence nao encontrado; revise o projeto antes de limpar.';
  END IF;
END $$;

-- Contagens para conferencia na execucao futura, antes das exclusoes.
SELECT 'audit_logs' AS tabela, count(*) AS registros FROM public.audit_logs
UNION ALL SELECT 'auth_sessions', count(*) FROM public.auth_sessions
UNION ALL SELECT 'batches', count(*) FROM public.batches
UNION ALL SELECT 'movement_item_distributions', count(*) FROM public.movement_item_distributions
UNION ALL SELECT 'movement_items', count(*) FROM public.movement_items
UNION ALL SELECT 'movements', count(*) FROM public.movements
UNION ALL SELECT 'product_unit_conversions', count(*) FROM public.product_unit_conversions
UNION ALL SELECT 'product_unit_options', count(*) FROM public.product_unit_options
UNION ALL SELECT 'products', count(*) FROM public.products
UNION ALL SELECT 'shipment_item_additional_photos', count(*) FROM public.shipment_item_additional_photos
UNION ALL SELECT 'shipment_items', count(*) FROM public.shipment_items
UNION ALL SELECT 'shipment_separation_drafts', count(*) FROM public.shipment_separation_drafts
UNION ALL SELECT 'shipments', count(*) FROM public.shipments
UNION ALL SELECT 'stock_positions', count(*) FROM public.stock_positions
UNION ALL SELECT 'users (exceto ADMIN novo)', count(*) FROM public.users
  WHERE id <> (SELECT admin_id FROM cleanup_production_parameters)
ORDER BY tabela;

-- Apenas os triggers de imutabilidade impedem a limpeza. FKs continuam ativas.
ALTER TABLE public.shipment_item_additional_photos DISABLE TRIGGER shipment_additional_photo_immutable;
ALTER TABLE public.movement_items DISABLE TRIGGER movement_record_identity;
ALTER TABLE public.shipment_items DISABLE TRIGGER shipment_item_immutable;
ALTER TABLE public.shipments DISABLE TRIGGER shipment_immutable;

-- Filhos antes dos pais, sem CASCADE.
DELETE FROM public.movement_item_distributions;
DELETE FROM public.movement_items;
DELETE FROM public.movements;
DELETE FROM public.shipment_item_additional_photos;
DELETE FROM public.shipment_separation_drafts;
DELETE FROM public.shipment_items;

-- Envios derivados referenciam o original: remover folhas ate esvaziar.
DO $$
DECLARE removed_count bigint;
BEGIN
  LOOP
    DELETE FROM public.shipments parent
    WHERE NOT EXISTS (
      SELECT 1 FROM public.shipments child WHERE child.source_shipment_id = parent.id
    );
    GET DIAGNOSTICS removed_count = ROW_COUNT;
    EXIT WHEN removed_count = 0;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.shipments) THEN
    RAISE EXCEPTION 'Envios restantes (possivel ciclo de origem); limpeza cancelada.';
  END IF;
END $$;

DELETE FROM public.stock_positions;
DELETE FROM public.batches;
DELETE FROM public.product_unit_options;
DELETE FROM public.product_unit_conversions;
DELETE FROM public.products;

-- Preservar somente a trilha de bootstrap do ADMIN novo, nao auditoria de testes.
DELETE FROM public.audit_logs a
WHERE NOT (
  a.action = 'SYSTEM_USER_BOOTSTRAP' AND a.entity_type = 'USER'
  AND a.entity_id IS NOT DISTINCT FROM
    (SELECT admin_id::text FROM cleanup_production_parameters)
);
DELETE FROM public.auth_sessions;
DELETE FROM public.user_roles
WHERE user_id <> (SELECT admin_id FROM cleanup_production_parameters);

-- Cadastros/configuracoes preservados nao devem referenciar usuarios removidos.
UPDATE public.stock_locations
SET created_by = NULL
WHERE created_by IS NOT NULL
  AND created_by <> (SELECT admin_id FROM cleanup_production_parameters);
UPDATE public.stock_locations
SET updated_by = NULL
WHERE updated_by IS NOT NULL
  AND updated_by <> (SELECT admin_id FROM cleanup_production_parameters);
UPDATE public.system_settings
SET updated_by_id = NULL
WHERE updated_by_id IS NOT NULL
  AND updated_by_id <> (SELECT admin_id FROM cleanup_production_parameters);
DELETE FROM public.users
WHERE id <> (SELECT admin_id FROM cleanup_production_parameters);

ALTER TABLE public.shipment_item_additional_photos ENABLE TRIGGER shipment_additional_photo_immutable;
ALTER TABLE public.movement_items ENABLE TRIGGER movement_record_identity;
ALTER TABLE public.shipment_items ENABLE TRIGGER shipment_item_immutable;
ALTER TABLE public.shipments ENABLE TRIGGER shipment_immutable;

-- Codigos publicos da producao comecarao em ENT/SAI/REV-000001.
ALTER SEQUENCE public.seq_movimentacao_ent RESTART WITH 1;
ALTER SEQUENCE public.seq_movimentacao_sai RESTART WITH 1;
ALTER SEQUENCE public.seq_movimentacao_rev RESTART WITH 1;

DO $$
DECLARE
  table_name text;
  has_rows boolean;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'auth_sessions', 'batches', 'movement_item_distributions',
    'movement_items', 'movements', 'product_unit_conversions',
    'product_unit_options', 'products', 'shipment_item_additional_photos',
    'shipment_items', 'shipment_separation_drafts', 'shipments', 'stock_positions'
  ] LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I)', table_name) INTO has_rows;
    IF has_rows THEN RAISE EXCEPTION 'Tabela % nao ficou vazia.', table_name; END IF;
  END LOOP;
  IF (SELECT count(*) FROM public.users) <> 1
     OR (SELECT count(*) FROM public.user_roles) <> 1 THEN
    RAISE EXCEPTION 'Estado final de usuarios/perfis inesperado.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger
    WHERE (tgrelid, tgname) IN (
      ('public.shipment_item_additional_photos'::regclass, 'shipment_additional_photo_immutable'),
      ('public.movement_items'::regclass, 'movement_record_identity'),
      ('public.shipment_items'::regclass, 'shipment_item_immutable'),
      ('public.shipments'::regclass, 'shipment_immutable')
    ) AND tgenabled <> 'O') THEN
    RAISE EXCEPTION 'Trigger de imutabilidade nao foi reabilitado.';
  END IF;
END $$;

-- PADRAO SEGURO: nenhuma alteracao persiste. Para executar definitivamente
-- em outra ocasiao, revisar TODO o plano e substituir somente esta linha por COMMIT.
ROLLBACK;

-- Depois de um COMMIT futuro: remover do bucket shipment-evidence somente os
-- caminhos exportados e confirmados como teste, usando Storage API/Dashboard.
-- NUNCA executar DELETE em storage.objects ou remover o bucket.
