/* global beforeAll, expect */
const { Client } = require('pg');

// TypeORM dropSchema remove tabelas, mas pode deixar funções de triggers.
// Cada suíte de integração já recria esse banco; limpar o schema isola também as funções.
const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl && expect.getState().testPath.endsWith('.integration.spec.ts')) {
  beforeAll(async () => {
    if (!new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Exige banco descartável _test.');
    const client = new Client({ connectionString: databaseUrl });
    try {
      await client.connect();
      await client.query('DROP SCHEMA public CASCADE');
      await client.query('CREATE SCHEMA public');
    } finally { await client.end(); }
  });
}
