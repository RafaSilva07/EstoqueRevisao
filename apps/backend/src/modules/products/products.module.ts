import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductEntity } from './entities/product.entity';
import { ProductUnitConversionEntity } from './entities/product-unit-conversion.entity';
import { ProductsController } from './products.controller';
import { ProductsRepository } from './products.repository';
import { ProductsService } from './products.service';
import { ProductUnitConversionsRepository } from './product-unit-conversions.repository';
import { ProductUnitConversionsService } from './product-unit-conversions.service';

@Module({
  imports: [TypeOrmModule.forFeature([ProductEntity, ProductUnitConversionEntity])],
  controllers: [ProductsController],
  providers: [
    ProductsRepository,
    ProductsService,
    ProductUnitConversionsRepository,
    ProductUnitConversionsService,
  ],
  exports: [ProductsRepository],
})
export class ProductsModule {}
