import { DataSourceOptions } from 'typeorm';

type PostgresConnectionOptions = Pick<
  DataSourceOptions & { type: 'postgres' },
  'host' | 'port' | 'username' | 'password' | 'database' | 'ssl'
>;

export function parseDatabaseConnection(
  databaseUrl: string,
  sslEnabled: boolean,
  hostOverride?: string,
): PostgresConnectionOptions {
  const parsed = new URL(databaseUrl);
  const originalHostname = parsed.hostname;

  return {
    host: hostOverride || originalHostname,
    port: parsed.port ? Number(parsed.port) : 5432,
    username: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, '')),
    ssl: sslEnabled
      ? {
          rejectUnauthorized: false,
          ...(hostOverride ? { servername: originalHostname } : {}),
        }
      : false,
  };
}
