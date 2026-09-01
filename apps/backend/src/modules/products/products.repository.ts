import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ProductQueryDto } from './dto/product-query.dto';
import { ProductEntity } from './entities/product.entity';

@Injectable()
export class ProductsRepository {
  constructor(
    @InjectRepository(ProductEntity)
    private readonly repository: Repository<ProductEntity>,
  ) {}

  findById(id: string, manager?: EntityManager): Promise<ProductEntity | null> {
    return (manager?.getRepository(ProductEntity) ?? this.repository).findOne({ where: { id } });
  }

  findAndCount(query: ProductQueryDto): Promise<[ProductEntity[], number]> {
    const builder = this.repository.createQueryBuilder('product');

    if (query.search) {
      builder.andWhere(
        '(product.code ILIKE :search OR product.name ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.active !== undefined) {
      builder.andWhere('product.active = :active', { active: query.active });
    }

    return builder
      .orderBy('product.name', 'ASC')
      .addOrderBy('product.code', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
  }

  existsByCode(code: string, excludeId?: string, manager?: EntityManager): Promise<boolean> {
    const builder = (manager?.getRepository(ProductEntity) ?? this.repository)
      .createQueryBuilder('product')
      .where('LOWER(product.code) = LOWER(:code)', { code });
    if (excludeId) {
      builder.andWhere('product.id <> :excludeId', { excludeId });
    }
    return builder.getExists();
  }

  save(product: ProductEntity, manager?: EntityManager): Promise<ProductEntity> {
    return (manager?.getRepository(ProductEntity) ?? this.repository).save(product);
  }
}
