import { MigrationInterface, QueryRunner } from 'typeorm';
export class AccountFormDrafts1791331200000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE form_drafts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      operational_mode varchar(15) NOT NULL CHECK (operational_mode IN ('ADMIN','REVISAO','PRODUCAO','EXPEDICAO','PCP')),
      form_key varchar(180) NOT NULL CHECK (form_key ~ '^[A-Za-z0-9_:-]+$'), title varchar(120) NOT NULL,
      payload jsonb CHECK (payload IS NULL OR (jsonb_typeof(payload)='object' AND octet_length(payload::text)<=1048576)),
      photos jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(photos)='array' AND jsonb_array_length(photos)<=100),
      version integer NOT NULL CHECK (version>0), updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (user_id,operational_mode,form_key)
    );
    ALTER TABLE form_drafts ENABLE ROW LEVEL SECURITY;`);
  }
  async down(runner: QueryRunner): Promise<void> {
    const active = await runner.query('SELECT 1 FROM form_drafts WHERE payload IS NOT NULL LIMIT 1') as unknown[];
    if (active.length) throw new Error('Existem rascunhos ativos: rollback destrutivo proibido.');
    await runner.query('DROP TABLE form_drafts');
  }
}
