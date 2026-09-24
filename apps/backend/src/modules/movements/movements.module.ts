import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BatchesModule } from '../batches/batches.module';
import { StocksModule } from '../stocks/stocks.module';
import { MovementItemEntity } from './entities/movement-item.entity';
import { MovementEntity } from './entities/movement.entity';
import { MovementItemDistributionEntity } from './entities/movement-item-distribution.entity';
import { MovementsController } from './movements.controller';
import { MovementsRepository } from './movements.repository';
import { MovementsService } from './movements.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MovementEntity,
      MovementItemEntity,
      MovementItemDistributionEntity,
    ]),
    StocksModule,
    BatchesModule,
    SettingsModule,
  ],
  controllers: [MovementsController],
  providers: [MovementsRepository, MovementsService],
  exports: [MovementsRepository],
})
export class MovementsModule {}
