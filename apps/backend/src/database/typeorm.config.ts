import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { AuditLogEntity } from '../modules/audit/entities/audit-log.entity';
import { AuthSessionEntity } from '../modules/auth/entities/auth-session.entity';
import { PermissionEntity } from '../modules/users/entities/permission.entity';
import { RoleEntity } from '../modules/users/entities/role.entity';
import { UserEntity } from '../modules/users/entities/user.entity';
import { InitialFoundation1788134400000 } from './migrations/1788134400000-initial-foundation';

export const databaseEntities = [
  UserEntity,
  RoleEntity,
  PermissionEntity,
  AuthSessionEntity,
  AuditLogEntity,
];

export const databaseMigrations = [InitialFoundation1788134400000];

export function buildTypeOrmOptions(configService: ConfigService): TypeOrmModuleOptions {
  const useSsl = configService.getOrThrow<boolean>('DATABASE_SSL');

  return {
    type: 'postgres',
    url: configService.getOrThrow<string>('DATABASE_URL'),
    ssl: useSsl ? { rejectUnauthorized: true } : false,
    entities: databaseEntities,
    migrations: databaseMigrations,
    synchronize: false,
    migrationsRun: false,
    retryAttempts: 1,
    retryDelay: 1000,
    logging: false,
  };
}
