import { Module } from '@nestjs/common';
import { BatchesModule } from '../batches/batches.module';
import { StocksModule } from '../stocks/stocks.module';
import { MovementsModule } from '../movements/movements.module';
import { ShipmentsController } from './shipments.controller';
import { ShipmentsService } from './shipments.service';
import { StorageModule } from '../storage/storage.module';
import { CreateShipmentMultipartPipe } from './create-shipment-multipart.pipe';
import { ShipmentPhotosInterceptor } from './shipment-photos.interceptor';
import { SettingsModule } from '../settings/settings.module';

@Module({ imports: [BatchesModule, StocksModule, MovementsModule, StorageModule, SettingsModule], controllers: [ShipmentsController], providers: [ShipmentsService, CreateShipmentMultipartPipe, ShipmentPhotosInterceptor] })
export class ShipmentsModule {}
