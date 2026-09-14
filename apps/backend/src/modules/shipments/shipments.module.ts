import { Module } from '@nestjs/common';
import { BatchesModule } from '../batches/batches.module';
import { StocksModule } from '../stocks/stocks.module';
import { MovementsModule } from '../movements/movements.module';
import { ShipmentsController } from './shipments.controller';
import { ShipmentsService } from './shipments.service';

@Module({ imports: [BatchesModule, StocksModule, MovementsModule], controllers: [ShipmentsController], providers: [ShipmentsService] })
export class ShipmentsModule {}
