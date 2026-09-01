import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockLocationEntity } from './entities/stock-location.entity';
import { StockLocationsController } from './stock-locations.controller';
import { StockLocationsRepository } from './stock-locations.repository';
import { StockLocationsService } from './stock-locations.service';
import { ProductsModule } from '../products/products.module';
import { BatchesModule } from '../batches/batches.module';
import { StockPositionEntity } from './entities/stock-position.entity';
import { StockPositionsController } from './stock-positions.controller';
import { StockPositionsRepository } from './stock-positions.repository';
import { StockPositionsService } from './stock-positions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([StockLocationEntity, StockPositionEntity]),
    ProductsModule,
    BatchesModule,
  ],
  controllers: [StockLocationsController, StockPositionsController],
  providers: [
    StockLocationsRepository,
    StockLocationsService,
    StockPositionsRepository,
    StockPositionsService,
  ],
  exports: [StockPositionsService],
})
export class StocksModule {}
