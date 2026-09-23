import { parseDatabaseConnection } from './database-connection';

describe('parseDatabaseConnection', () => {
  it('decodes credentials and preserves the pooler hostname for TLS when overriding the address', () => {
    const options = parseDatabaseConnection(
      'postgresql://postgres.project:Senha%40Segura@pooler.supabase.com:5432/postgres',
      true,
      '192.0.2.10',
    );

    expect(options).toEqual({
      host: '192.0.2.10',
      port: 5432,
      username: 'postgres.project',
      password: 'Senha@Segura',
      database: 'postgres',
      ssl: {
        rejectUnauthorized: false,
        servername: 'pooler.supabase.com',
      },
    });
  });
});
