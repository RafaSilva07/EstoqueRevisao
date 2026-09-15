import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { AuditLogEntity } from '../modules/audit/entities/audit-log.entity';
import { AuthSessionEntity } from '../modules/auth/entities/auth-session.entity';
import { PermissionEntity } from '../modules/users/entities/permission.entity';
import { RoleEntity } from '../modules/users/entities/role.entity';
import { UserEntity } from '../modules/users/entities/user.entity';
import { ProductEntity } from '../modules/products/entities/product.entity';
import { ProductUnitConversionEntity } from '../modules/products/entities/product-unit-conversion.entity';
import { BatchEntity } from '../modules/batches/entities/batch.entity';
import { StockLocationEntity } from '../modules/stocks/entities/stock-location.entity';
import { InitialFoundation1788134400000 } from './migrations/1788134400000-initial-foundation';
import { BaseRegistries1788220800000 } from './migrations/1788220800000-base-registries';
import { StockPositionEntity } from '../modules/stocks/entities/stock-position.entity';
import { BatchManufacturingAndStockPositions1788307200000 } from './migrations/1788307200000-batch-manufacturing-and-stock-positions';
import { MovementEntity } from '../modules/movements/entities/movement.entity';
import { MovementItemEntity } from '../modules/movements/entities/movement-item.entity';
import { ExternalEntryMovements1788393600000 } from './migrations/1788393600000-external-entry-movements';
import { MovementItemDistributionEntity } from '../modules/movements/entities/movement-item-distribution.entity';
import { ReviewMovements1788480000000 } from './migrations/1788480000000-review-movements';
import { TransferDestinationBatches1788566400000 } from './migrations/1788566400000-transfer-destination-batches';
import { MovementCancellations1788652800000 } from './migrations/1788652800000-movement-cancellations';

import { OperationalLotExpiration1789084800000 } from './migrations/1789084800000-operational-lot-expiration';

import { ShipmentEntity, ShipmentItemEntity } from '../modules/shipments/shipment.entity';
import { SectorShipments1789344000000 } from './migrations/1789344000000-sector-shipments';
import { ShipmentObservations1789430400000 } from './migrations/1789430400000-shipment-observations';

export const databaseEntities = [
  ShipmentEntity,
  ShipmentItemEntity,
  UserEntity,
  RoleEntity,
  PermissionEntity,
  AuthSessionEntity,
  AuditLogEntity,
  ProductEntity,
  ProductUnitConversionEntity,
  BatchEntity,
  StockLocationEntity,
  StockPositionEntity,
  MovementEntity,
  MovementItemEntity,
  MovementItemDistributionEntity,
];

export const databaseMigrations = [
  InitialFoundation1788134400000,
  BaseRegistries1788220800000,
  BatchManufacturingAndStockPositions1788307200000,
  ExternalEntryMovements1788393600000,
  ReviewMovements1788480000000,
  TransferDestinationBatches1788566400000,
  MovementCancellations1788652800000,
  OperationalLotExpiration1789084800000,
  SectorShipments1789344000000,
  ShipmentObservations1789430400000,
];

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
