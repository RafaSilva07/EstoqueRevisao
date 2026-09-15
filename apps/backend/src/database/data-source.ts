import 'reflect-metadata';
import { config as loadEnvironment } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DataSource, DataSourceOptions } from 'typeorm';
import { databaseEntities, databaseMigrations } from './typeorm.config';

const localEnvironment = resolve(process.cwd(), '.env');
const rootEnvironment = resolve(process.cwd(), '../../.env');
loadEnvironment({ path: existsSync(localEnvironment) ? localEnvironment : rootEnvironment });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL deve ser definida para executar migrations.');
}

const options: DataSourceOptions = {
  type: 'postgres',
  url: databaseUrl,
  ssl:
    process.env.DATABASE_SSL === 'true'
      ? { rejectUnauthorized: false }
      : false,
  entities: databaseEntities,
  migrations: databaseMigrations,
  synchronize: false,
  migrationsTableName: 'schema_migrations',
};
export default new DataSource(options);
