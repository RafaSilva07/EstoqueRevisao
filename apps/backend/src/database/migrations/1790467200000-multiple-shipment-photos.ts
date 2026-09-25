import { MigrationInterface, QueryRunner } from 'typeorm';

export class MultipleShipmentPhotos1790467200000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      INSERT INTO system_settings(key, value) VALUES
        ('shipment_photo_minimum', '1'),
        ('shipment_photo_maximum', '5');
      ALTER TABLE system_settings ADD CONSTRAINT shipment_photo_settings_valid CHECK (
        CASE WHEN key IN ('shipment_photo_minimum', 'shipment_photo_maximum')
          THEN CASE WHEN value ~ '^[0-9]+$' THEN value::integer BETWEEN 1 AND 10 ELSE false END
          ELSE true END
      );
      CREATE TABLE shipment_item_additional_photos (
        id uuid PRIMARY KEY,
        shipment_item_id uuid NOT NULL REFERENCES shipment_items(id) ON DELETE RESTRICT,
        ordinal integer NOT NULL CHECK (ordinal BETWEEN 2 AND 10),
        storage_key varchar(300) NOT NULL UNIQUE,
        mime_type varchar(30) NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp')),
        size integer NOT NULL CHECK (size BETWEEN 1 AND 5242880),
        UNIQUE (shipment_item_id, ordinal)
      );
      CREATE FUNCTION protect_shipment_additional_photo() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Fotos de envios são imutáveis'; END $$;
      CREATE TRIGGER shipment_additional_photo_immutable BEFORE UPDATE OR DELETE ON shipment_item_additional_photos
        FOR EACH ROW EXECUTE FUNCTION protect_shipment_additional_photo();
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    const existing = await runner.query('SELECT 1 FROM shipment_item_additional_photos LIMIT 1') as unknown[];
    if (existing.length) throw new Error('Existem fotos adicionais: rollback perderia evidências históricas.');
    await runner.query(`
      DROP TABLE shipment_item_additional_photos;
      DROP FUNCTION protect_shipment_additional_photo();
      ALTER TABLE system_settings DROP CONSTRAINT shipment_photo_settings_valid;
      DELETE FROM system_settings WHERE key IN ('shipment_photo_minimum', 'shipment_photo_maximum');
    `);
  }
}
