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
    return (manager?.getRepository(ProductEntity) ?? this.repository).findOne({ where: { id }, relations: { unitProducts: true } });
  }

  findAndCount(query: ProductQueryDto): Promise<[ProductEntity[], number]> {
    const builder = this.repository.createQueryBuilder('product').leftJoinAndSelect('product.unitProducts', 'unitProduct');
    if (query.defaultUnit) builder.andWhere('product.defaultUnit = :unit', { unit: query.defaultUnit });
    if (query.code) builder.andWhere('LOWER(product.code) = LOWER(:code)', { code: query.code });

    if (query.search) {
      const field = query.searchField === 'code'
        ? 'product.code'
        : query.searchField === 'name' ? 'product.name' : null;
      builder.andWhere(
        field ? `${field} ILIKE :search` : '(product.code ILIKE :search OR product.name ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.active !== undefined) {
      builder.andWhere('product.active = :active', { active: query.active });
    }

    const sort = query.searchField === 'code' ? 'CODE' : query.sort;
    const primary = sort === 'RECENT' ? 'product.createdAt' : sort === 'CODE' ? 'product.code' : 'product.name';
    return builder
      .orderBy(primary, sort === 'RECENT' ? 'DESC' : 'ASC')
      .addOrderBy('product.id', 'ASC')
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
