import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ProductUnitConversionEntity } from './entities/product-unit-conversion.entity';

@Injectable()
export class ProductUnitConversionsRepository {
  constructor(
    @InjectRepository(ProductUnitConversionEntity)
    private readonly repository: Repository<ProductUnitConversionEntity>,
  ) {}

  findByProduct(productId: string): Promise<ProductUnitConversionEntity[]> {
    return this.repository.find({
      where: { productId },
      order: { fromUnit: 'ASC', toUnit: 'ASC' },
    });
  }

  findById(id: string, manager?: EntityManager): Promise<ProductUnitConversionEntity | null> {
    return (manager?.getRepository(ProductUnitConversionEntity) ?? this.repository)
      .findOne({ where: { id } });
  }

  existsByUnits(
    productId: string,
    fromUnit: string,
    toUnit: string,
    excludeId?: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    const builder = (manager?.getRepository(ProductUnitConversionEntity) ?? this.repository)
      .createQueryBuilder('conversion')
      .where('conversion.productId = :productId', { productId })
      .andWhere('LOWER(conversion.fromUnit) = LOWER(:fromUnit)', { fromUnit })
      .andWhere('LOWER(conversion.toUnit) = LOWER(:toUnit)', { toUnit });
    if (excludeId) {
      builder.andWhere('conversion.id <> :excludeId', { excludeId });
    }
    return builder.getExists();
  }

  save(
    conversion: ProductUnitConversionEntity,
    manager?: EntityManager,
  ): Promise<ProductUnitConversionEntity> {
    return (manager?.getRepository(ProductUnitConversionEntity) ?? this.repository).save(conversion);
  }
}
