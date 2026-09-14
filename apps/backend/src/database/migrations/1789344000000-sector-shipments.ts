import { MigrationInterface, QueryRunner } from 'typeorm';

export class SectorShipments1789344000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE users ADD sector varchar(20) NOT NULL DEFAULT 'REVISAO'
        CHECK (sector IN ('REVISAO', 'PRODUCAO', 'EXPEDICAO'));
      ALTER TABLE stock_locations ADD sector varchar(20) UNIQUE
        CHECK (sector IS NULL OR (kind = 'EXTERNAL' AND sector IN ('PRODUCAO', 'EXPEDICAO')));
      UPDATE stock_locations SET sector = code WHERE code IN ('PRODUCAO', 'EXPEDICAO') AND kind = 'EXTERNAL';
      CREATE TABLE shipments (
        id uuid PRIMARY KEY, request_key uuid NOT NULL UNIQUE,
        origin_sector varchar(20) NOT NULL CHECK (origin_sector IN ('REVISAO','PRODUCAO','EXPEDICAO')),
        destination_sector varchar(20) NOT NULL CHECK (destination_sector IN ('REVISAO','PRODUCAO','EXPEDICAO')),
        created_by_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        origin_location_id uuid REFERENCES stock_locations(id) ON DELETE RESTRICT,
        destination_location_id uuid NOT NULL REFERENCES stock_locations(id) ON DELETE RESTRICT,
        status varchar(30) NOT NULL DEFAULT 'AGUARDANDO_RECEBIMENTO',
        decided_by_id uuid REFERENCES users(id) ON DELETE RESTRICT,
        decided_at timestamptz, refusal_reason varchar(1000),
        CHECK ((origin_sector = 'REVISAO') <> (destination_sector = 'REVISAO')),
        CHECK ((origin_sector = 'REVISAO') = (origin_location_id IS NULL)),
        CHECK (
          (status = 'AGUARDANDO_RECEBIMENTO' AND decided_by_id IS NULL AND decided_at IS NULL AND refusal_reason IS NULL)
          OR (status = 'CONFIRMADO' AND decided_by_id IS NOT NULL AND decided_at IS NOT NULL AND refusal_reason IS NULL)
          OR (status = 'RECUSADO' AND decided_by_id IS NOT NULL AND decided_at IS NOT NULL AND refusal_reason IS NOT NULL AND length(trim(refusal_reason)) > 0)
        )
      );
      CREATE INDEX ON shipments(destination_sector, status, created_at DESC);
      CREATE INDEX ON shipments(created_by_id, created_at DESC);
      CREATE INDEX ON shipments(origin_sector, status, created_at DESC);
      CREATE TABLE shipment_items (
        id uuid PRIMARY KEY, shipment_id uuid NOT NULL REFERENCES shipments(id) ON DELETE RESTRICT,
        product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        batch_id uuid NOT NULL REFERENCES batches(id) ON DELETE RESTRICT,
        stock_location_id uuid REFERENCES stock_locations(id) ON DELETE RESTRICT,
        quantity numeric(18,6) NOT NULL CHECK (quantity > 0 AND quantity = trunc(quantity)),
        product_snapshot jsonb NOT NULL,
        FOREIGN KEY (batch_id, product_id) REFERENCES batches(id, product_id) ON DELETE RESTRICT
      );
      CREATE INDEX ON shipment_items(shipment_id);
      ALTER TABLE movements ADD shipment_id uuid REFERENCES shipments(id) ON DELETE RESTRICT;
      CREATE UNIQUE INDEX ON movements(shipment_id, origin_location_id) WHERE shipment_id IS NOT NULL;
      CREATE OR REPLACE FUNCTION protect_shipment_history() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP = 'DELETE' OR OLD.status <> 'AGUARDANDO_RECEBIMENTO' OR NEW.status = 'AGUARDANDO_RECEBIMENTO'
          OR (to_jsonb(NEW) - ARRAY['status','decided_by_id','decided_at','refusal_reason'])
             IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','decided_by_id','decided_at','refusal_reason']) THEN
          RAISE EXCEPTION 'Envio imutável: somente decisão de recebimento é permitida';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER shipment_immutable BEFORE UPDATE OR DELETE ON shipments
        FOR EACH ROW EXECUTE FUNCTION protect_shipment_history();
      CREATE OR REPLACE FUNCTION protect_shipment_item() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Itens enviados são imutáveis'; END $$;
      CREATE TRIGGER shipment_item_immutable BEFORE UPDATE OR DELETE ON shipment_items
        FOR EACH ROW EXECUTE FUNCTION protect_shipment_item();
      INSERT INTO roles(id,code,name) VALUES
        (gen_random_uuid(),'PRODUCAO','Produção'), (gen_random_uuid(),'EXPEDICAO','Expedição');
      INSERT INTO permissions(id,code,description) VALUES
        (gen_random_uuid(),'shipments.read','Consultar envios do próprio setor'),
        (gen_random_uuid(),'shipments.create','Criar envios entre setores'),
        (gen_random_uuid(),'shipments.decide','Confirmar ou recusar recebimento do setor');
      INSERT INTO role_permissions(role_id, permission_id)
        SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
        WHERE (r.code IN ('ADMIN','PRODUCAO','EXPEDICAO') AND p.code LIKE 'shipments.%')
          OR (r.code IN ('PRODUCAO','EXPEDICAO') AND p.code = 'products.read')
        ON CONFLICT DO NOTHING;
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    const rows = await runner.query('SELECT 1 FROM shipments LIMIT 1') as unknown[];
    if (rows.length) throw new Error('Existem envios: rollback destrutivo não permitido.');
    const externalUsers = await runner.query("SELECT 1 FROM users WHERE sector <> 'REVISAO' LIMIT 1") as unknown[];
    if (externalUsers.length) throw new Error('Existem usuários setoriais: rollback destrutivo não permitido.');
    await runner.query(`
      DELETE FROM permissions WHERE code LIKE 'shipments.%';
      DELETE FROM roles WHERE code IN ('PRODUCAO','EXPEDICAO');
      ALTER TABLE movements DROP COLUMN shipment_id;
      DROP TABLE shipment_items; DROP TABLE shipments;
      DROP FUNCTION protect_shipment_item(); DROP FUNCTION protect_shipment_history();
      ALTER TABLE stock_locations DROP COLUMN sector;
      ALTER TABLE users DROP COLUMN sector;
    `);
  }
}
