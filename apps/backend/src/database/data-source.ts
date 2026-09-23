import 'reflect-metadata';
import { config as loadEnvironment } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DataSource, DataSourceOptions } from 'typeorm';
import { parseDatabaseConnection } from './database-connection';
import { databaseEntities, databaseMigrations } from './typeorm.config';

const localEnvironment = resolve(process.cwd(), '.env');
const rootEnvironment = resolve(process.cwd(), '../../.env');
loadEnvironment({ path: existsSync(localEnvironment) ? localEnvironment : rootEnvironment });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL deve ser definida para executar migrations.');
}
const databaseSsl = process.env.DATABASE_SSL === 'true';
if (new URL(databaseUrl).hostname.toLowerCase().endsWith('.supabase.com') && !databaseSsl) {
  throw new Error('DATABASE_SSL deve ser true para executar migrations no Supabase.');
}

const options: DataSourceOptions = {
  type: 'postgres',
  ...parseDatabaseConnection(databaseUrl, databaseSsl, process.env.DATABASE_HOST_OVERRIDE),
  entities: databaseEntities,
  migrations: databaseMigrations,
  synchronize: false,
  migrationsTableName: 'schema_migrations',
  extra: {
    max: 2,
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 30000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  },
};
export default new DataSource(options);
