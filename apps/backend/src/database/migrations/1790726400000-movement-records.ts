import { MigrationInterface, QueryRunner } from 'typeorm';

export class MovementRecords1790726400000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE shipment_items ADD COLUMN record_ordinal integer, ADD COLUMN codigo_registro varchar(50);
      ALTER TABLE movement_items ADD COLUMN record_ordinal integer, ADD COLUMN codigo_registro varchar(50),
        ADD COLUMN shipment_item_id uuid REFERENCES shipment_items(id) ON DELETE RESTRICT,
        ADD COLUMN pcp_execution_status varchar(20) NOT NULL DEFAULT 'PENDENTE',
        ADD COLUMN pcp_executed_by_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
        ADD COLUMN pcp_executed_at timestamptz,
        ADD COLUMN pcp_execution_observation varchar(1000);

      CREATE FUNCTION movement_record_suffix(ordinal integer) RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT AS $$
      DECLARE value integer := ordinal; result text := '';
      BEGIN
        IF value < 1 THEN RAISE EXCEPTION 'Record ordinal must be positive'; END IF;
        WHILE value > 0 LOOP
          value := value - 1;
          result := chr(65 + (value % 26)) || result;
          value := value / 26;
        END LOOP;
        RETURN result;
      END $$;

      ALTER TABLE shipment_items DISABLE TRIGGER shipment_item_immutable;
      WITH ranked AS (
        SELECT id, row_number() OVER (PARTITION BY shipment_id ORDER BY id)::integer AS ordinal
        FROM shipment_items
      )
      UPDATE shipment_items item SET record_ordinal = ranked.ordinal,
        codigo_registro = shipment.codigo_movimentacao || '-' || movement_record_suffix(ranked.ordinal)
      FROM ranked JOIN shipments shipment ON shipment.id = (SELECT shipment_id FROM shipment_items WHERE id = ranked.id)
      WHERE item.id = ranked.id;
      ALTER TABLE shipment_items ENABLE TRIGGER shipment_item_immutable;

      -- A legacy movement may have been split by source location. Pair old rows deterministically
      -- with shipment rows having the same product, batch and source; no stock data is changed.
      WITH movement_ranked AS (
        SELECT item.id, movement.shipment_id, movement.origin_location_id, item.product_id, item.batch_id,
          row_number() OVER (PARTITION BY movement.shipment_id, movement.origin_location_id, item.product_id, item.batch_id
            ORDER BY item.quantity DESC, item.id)::integer AS occurrence
        FROM movement_items item JOIN movements movement ON movement.id = item.movement_id
        WHERE movement.shipment_id IS NOT NULL
      ), shipment_ranked AS (
        SELECT item.id, item.shipment_id, COALESCE(item.stock_location_id, shipment.origin_location_id) AS origin_location_id,
          item.product_id, item.batch_id,
          row_number() OVER (PARTITION BY item.shipment_id, COALESCE(item.stock_location_id, shipment.origin_location_id),
            item.product_id, item.batch_id ORDER BY item.quantity DESC, item.record_ordinal)::integer AS occurrence
        FROM shipment_items item JOIN shipments shipment ON shipment.id = item.shipment_id
      )
      UPDATE movement_items item SET shipment_item_id = source.id
      FROM movement_ranked target JOIN shipment_ranked source
        ON source.shipment_id = target.shipment_id AND source.origin_location_id = target.origin_location_id
        AND source.product_id = target.product_id AND source.batch_id = target.batch_id
        AND source.occurrence = target.occurrence
      WHERE item.id = target.id;

      WITH ranked AS (
        SELECT item.id, row_number() OVER (PARTITION BY item.movement_id ORDER BY item.id)::integer AS ordinal,
          row_number() OVER (PARTITION BY COALESCE(movement.shipment_id, movement.id)
            ORDER BY movement.occurred_at, movement.id, item.id)::integer AS group_ordinal,
          movement.shipment_id, movement.codigo_movimentacao,
          COALESCE((SELECT max(shipment_item.record_ordinal) FROM shipment_items shipment_item
            WHERE shipment_item.shipment_id = movement.shipment_id), 0) AS max_shipment_ordinal,
          source.record_ordinal AS source_ordinal,
          source.codigo_registro AS source_code, movement.pcp_execution_status,
          movement.pcp_executed_by_user_id, movement.pcp_executed_at, movement.pcp_execution_observation
        FROM movement_items item JOIN movements movement ON movement.id = item.movement_id
        LEFT JOIN shipment_items source ON source.id = item.shipment_item_id
      )
      UPDATE movement_items item SET
        record_ordinal = COALESCE(ranked.source_ordinal,
          CASE WHEN ranked.shipment_id IS NULL THEN ranked.ordinal
            ELSE ranked.max_shipment_ordinal + ranked.group_ordinal END),
        codigo_registro = COALESCE(ranked.source_code,
          CASE WHEN ranked.codigo_movimentacao IS NULL THEN NULL
            ELSE ranked.codigo_movimentacao || '-' || movement_record_suffix(
              CASE WHEN ranked.shipment_id IS NULL THEN ranked.ordinal
                ELSE ranked.max_shipment_ordinal + ranked.group_ordinal END) END),
        pcp_execution_status = ranked.pcp_execution_status,
        pcp_executed_by_user_id = ranked.pcp_executed_by_user_id,
        pcp_executed_at = ranked.pcp_executed_at,
        pcp_execution_observation = ranked.pcp_execution_observation
      FROM ranked WHERE item.id = ranked.id;

      ALTER TABLE shipment_items ALTER COLUMN record_ordinal SET NOT NULL;
      ALTER TABLE movement_items ALTER COLUMN record_ordinal SET NOT NULL;
      ALTER TABLE shipment_items ADD CONSTRAINT shipment_record_ordinal_positive CHECK (record_ordinal > 0);
      ALTER TABLE movement_items ADD CONSTRAINT movement_record_ordinal_positive CHECK (record_ordinal > 0);
      ALTER TABLE movement_items ADD CONSTRAINT movement_item_pcp_status_valid CHECK (pcp_execution_status IN ('PENDENTE','EXECUTADA'));
      ALTER TABLE movement_items ADD CONSTRAINT movement_item_pcp_execution_complete CHECK (
        (pcp_execution_status = 'PENDENTE' AND pcp_executed_by_user_id IS NULL AND pcp_executed_at IS NULL AND pcp_execution_observation IS NULL)
        OR (pcp_execution_status = 'EXECUTADA' AND pcp_executed_by_user_id IS NOT NULL AND pcp_executed_at IS NOT NULL));
      CREATE UNIQUE INDEX shipment_items_group_ordinal_uq ON shipment_items(shipment_id, record_ordinal);
      CREATE UNIQUE INDEX shipment_items_code_uq ON shipment_items(codigo_registro);
      CREATE UNIQUE INDEX movement_items_group_ordinal_uq ON movement_items(movement_id, record_ordinal);
      CREATE UNIQUE INDEX movement_items_code_uq ON movement_items(codigo_registro);
      CREATE UNIQUE INDEX movement_items_shipment_item_uq ON movement_items(shipment_item_id) WHERE shipment_item_id IS NOT NULL;
      CREATE INDEX movement_items_pcp_queue_idx ON movement_items(pcp_execution_status, movement_id);

      CREATE FUNCTION assign_shipment_record_code() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE group_code text;
      BEGIN
        SELECT codigo_movimentacao INTO group_code FROM shipments WHERE id = NEW.shipment_id FOR UPDATE;
        IF group_code IS NULL THEN RAISE EXCEPTION 'Shipment group code not found'; END IF;
        IF NEW.record_ordinal IS NULL THEN
          SELECT COALESCE(max(record_ordinal), 0) + 1 INTO NEW.record_ordinal FROM shipment_items WHERE shipment_id = NEW.shipment_id;
        END IF;
        NEW.codigo_registro := group_code || '-' || movement_record_suffix(NEW.record_ordinal);
        RETURN NEW;
      END $$;
      CREATE TRIGGER shipment_record_code BEFORE INSERT ON shipment_items FOR EACH ROW EXECUTE FUNCTION assign_shipment_record_code();

      CREATE FUNCTION assign_movement_record_code() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE group_code text; group_shipment uuid; source_record record;
      BEGIN
        SELECT codigo_movimentacao, shipment_id INTO group_code, group_shipment
          FROM movements WHERE id = NEW.movement_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Movement group not found'; END IF;
        IF NEW.shipment_item_id IS NOT NULL THEN
          SELECT shipment_id, record_ordinal, codigo_registro INTO source_record
            FROM shipment_items WHERE id = NEW.shipment_item_id;
          IF NOT FOUND OR source_record.shipment_id IS DISTINCT FROM group_shipment THEN
            RAISE EXCEPTION 'Shipment record does not belong to movement group';
          END IF;
          NEW.record_ordinal := source_record.record_ordinal;
          NEW.codigo_registro := source_record.codigo_registro;
        ELSE
          IF NEW.record_ordinal IS NULL THEN
            SELECT COALESCE(max(record_ordinal), 0) + 1 INTO NEW.record_ordinal FROM movement_items WHERE movement_id = NEW.movement_id;
          END IF;
          NEW.codigo_registro := CASE WHEN group_code IS NULL THEN NULL
            ELSE group_code || '-' || movement_record_suffix(NEW.record_ordinal) END;
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER movement_record_code BEFORE INSERT ON movement_items FOR EACH ROW EXECUTE FUNCTION assign_movement_record_code();

      CREATE FUNCTION protect_movement_record_identity() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Movement records cannot be deleted'; END IF;
        IF NEW.movement_id IS DISTINCT FROM OLD.movement_id
          OR NEW.record_ordinal IS DISTINCT FROM OLD.record_ordinal
          OR NEW.codigo_registro IS DISTINCT FROM OLD.codigo_registro
          OR NEW.shipment_item_id IS DISTINCT FROM OLD.shipment_item_id THEN
          RAISE EXCEPTION 'Movement record identity is immutable';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER movement_record_identity BEFORE UPDATE OR DELETE ON movement_items
        FOR EACH ROW EXECUTE FUNCTION protect_movement_record_identity();
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    const partial = await runner.query(`SELECT 1 FROM movement_items item JOIN movements movement ON movement.id = item.movement_id
      WHERE item.pcp_execution_status = 'EXECUTADA' AND movement.pcp_execution_status = 'PENDENTE' LIMIT 1`) as unknown[];
    if (partial.length) throw new Error('Existem execucoes individuais parciais: rollback destrutivo nao permitido.');
    await runner.query(`
      DROP TRIGGER movement_record_identity ON movement_items;
      DROP FUNCTION protect_movement_record_identity();
      DROP TRIGGER movement_record_code ON movement_items;
      DROP FUNCTION assign_movement_record_code();
      DROP TRIGGER shipment_record_code ON shipment_items;
      DROP FUNCTION assign_shipment_record_code();
      DROP INDEX movement_items_pcp_queue_idx;
      DROP INDEX movement_items_shipment_item_uq;
      DROP INDEX movement_items_code_uq;
      DROP INDEX movement_items_group_ordinal_uq;
      DROP INDEX shipment_items_code_uq;
      DROP INDEX shipment_items_group_ordinal_uq;
      ALTER TABLE movement_items DROP CONSTRAINT movement_item_pcp_execution_complete,
        DROP CONSTRAINT movement_item_pcp_status_valid, DROP CONSTRAINT movement_record_ordinal_positive;
      ALTER TABLE shipment_items DROP CONSTRAINT shipment_record_ordinal_positive;
      ALTER TABLE movement_items DROP COLUMN pcp_execution_observation, DROP COLUMN pcp_executed_at,
        DROP COLUMN pcp_executed_by_user_id, DROP COLUMN pcp_execution_status,
        DROP COLUMN shipment_item_id, DROP COLUMN codigo_registro, DROP COLUMN record_ordinal;
      ALTER TABLE shipment_items DROP COLUMN codigo_registro, DROP COLUMN record_ordinal;
      DROP FUNCTION movement_record_suffix(integer);
    `);
  }
}
