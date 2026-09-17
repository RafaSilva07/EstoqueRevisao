import { MigrationInterface, QueryRunner } from 'typeorm';

export class ShipmentItemPhotos1789603200000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE shipment_items
        ADD photo_storage_key varchar(300),
        ADD photo_mime_type varchar(30),
        ADD photo_size integer,
        ADD CONSTRAINT shipment_item_photo_complete CHECK (
          (photo_storage_key IS NULL AND photo_mime_type IS NULL AND photo_size IS NULL)
          OR (photo_storage_key IS NOT NULL AND photo_mime_type IN ('image/jpeg','image/png','image/webp') AND photo_size > 0 AND photo_size <= 5242880)
        );
    `);
  }
  async down(runner: QueryRunner): Promise<void> {
    const photos = await runner.query('SELECT 1 FROM shipment_items WHERE photo_storage_key IS NOT NULL LIMIT 1') as unknown[];
    if (photos.length) throw new Error('Existem fotos de envios: rollback perderia as referências do histórico.');
    await runner.query('ALTER TABLE shipment_items DROP CONSTRAINT shipment_item_photo_complete, DROP COLUMN photo_size, DROP COLUMN photo_mime_type, DROP COLUMN photo_storage_key');
  }
}
