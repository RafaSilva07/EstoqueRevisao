import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockLocationEntity } from './entities/stock-location.entity';
import { StockLocationsController } from './stock-locations.controller';
import { StockLocationsRepository } from './stock-locations.repository';
import { StockLocationsService } from './stock-locations.service';

@Module({
  imports: [TypeOrmModule.forFeature([StockLocationEntity])],
  controllers: [StockLocationsController],
  providers: [StockLocationsRepository, StockLocationsService],
})
export class StocksModule {}
