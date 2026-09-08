import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MovementItemDistributionEntity } from '../movements/entities/movement-item-distribution.entity';
import { MovementItemEntity } from '../movements/entities/movement-item.entity';
import { StockPositionEntity } from '../stocks/entities/stock-position.entity';
import { ReportsController } from './reports.controller';
import { ReportsRepository } from './reports.repository';
import { ReportsService } from './reports.service';

@Module({
  imports: [TypeOrmModule.forFeature([
    MovementItemEntity,
    MovementItemDistributionEntity,
    StockPositionEntity,
  ])],
  controllers: [ReportsController],
  providers: [ReportsRepository, ReportsService],
})
export class ReportsModule {}
