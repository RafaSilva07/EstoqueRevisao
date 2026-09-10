import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsModule } from '../products/products.module';
import { BatchEntity } from './entities/batch.entity';
import { BatchesController } from './batches.controller';
import { BatchesRepository } from './batches.repository';
import { BatchesService } from './batches.service';
import { BatchCodeCodec } from './domain/batch-code.codec';

import { OperationalLotsService } from './operational-lots.service';

@Module({
  imports: [TypeOrmModule.forFeature([BatchEntity]), ProductsModule],
  controllers: [BatchesController],
  providers: [BatchesRepository, BatchesService, BatchCodeCodec, OperationalLotsService],
  exports: [BatchesRepository, BatchCodeCodec, OperationalLotsService],
})
export class BatchesModule {}
