import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { parseDatabaseConnection } from './database-connection';
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

import { ShipmentEntity, ShipmentItemEntity, ShipmentItemAdditionalPhotoEntity, ShipmentSeparationDraftEntity } from '../modules/shipments/shipment.entity';
import { SectorShipments1789344000000 } from './migrations/1789344000000-sector-shipments';
import { ShipmentObservations1789430400000 } from './migrations/1789430400000-shipment-observations';
import { ReviewPackageUnpacking1789516800000 } from './migrations/1789516800000-review-package-unpacking';
import { ShipmentItemPhotos1789603200000 } from './migrations/1789603200000-shipment-item-photos';
import { PcpMovementExecution1789689600000 } from './migrations/1789689600000-pcp-movement-execution';
import { ProductUnitWeight1789776000000 } from './migrations/1789776000000-product-unit-weight';
import { PcpSector1789862400000 } from './migrations/1789862400000-pcp-sector';
import { ReviewOperatorRole1789948800000 } from './migrations/1789948800000-review-operator-role';
import { SeparationAndSettings1790035200000 } from './migrations/1790035200000-separation-and-settings';
import { SystemSettingEntity } from '../modules/settings/system-setting.entity';
import { MovementPublicCodes1790121600000 } from './migrations/1790121600000-movement-public-codes';
import { ShipmentLifecyclePublicCodes1790208000000 } from './migrations/1790208000000-shipment-lifecycle-public-codes';
import { ShipmentSenderCancellation1790294400000 } from './migrations/1790294400000-shipment-sender-cancellation';
import { ProductManagementAllRoles1790380800000 } from './migrations/1790380800000-product-management-all-roles';
import { MultipleShipmentPhotos1790467200000 } from './migrations/1790467200000-multiple-shipment-photos';
import { ReviewDestinationEntity } from '../modules/settings/review-destination.entity';

export const databaseEntities = [
  ShipmentEntity,
  ShipmentItemEntity,
  ShipmentItemAdditionalPhotoEntity,
  ShipmentSeparationDraftEntity,
  SystemSettingEntity,
  ReviewDestinationEntity,
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
  ReviewPackageUnpacking1789516800000,
  ShipmentItemPhotos1789603200000,
  PcpMovementExecution1789689600000,
  ProductUnitWeight1789776000000,
  PcpSector1789862400000,
  ReviewOperatorRole1789948800000,
  SeparationAndSettings1790035200000,
  MovementPublicCodes1790121600000,
  ShipmentLifecyclePublicCodes1790208000000,
  ShipmentSenderCancellation1790294400000,
  ProductManagementAllRoles1790380800000,
  MultipleShipmentPhotos1790467200000,
];

export function buildTypeOrmOptions(configService: ConfigService): TypeOrmModuleOptions {
  const useSsl = configService.getOrThrow<boolean>('DATABASE_SSL');
  const databaseUrl = configService.getOrThrow<string>('DATABASE_URL');

  return {
    type: 'postgres',
    ...parseDatabaseConnection(
      databaseUrl,
      useSsl,
      configService.get<string>('DATABASE_HOST_OVERRIDE'),
    ),
    entities: databaseEntities,
    migrations: databaseMigrations,
    synchronize: false,
    migrationsRun: false,
    retryAttempts: 10,
    retryDelay: 3000,
    extra: {
      max: 5,
      connectionTimeoutMillis: 15000,
      idleTimeoutMillis: 30000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    },
    logging: false,
  };
}
