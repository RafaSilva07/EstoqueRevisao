import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { BatchQueryDto } from './dto/batch-query.dto';
import { BatchEntity } from './entities/batch.entity';

@Injectable()
export class BatchesRepository {
  constructor(
    @InjectRepository(BatchEntity)
    private readonly repository: Repository<BatchEntity>,
  ) {}

  findById(id: string, manager?: EntityManager): Promise<BatchEntity | null> {
    return (manager?.getRepository(BatchEntity) ?? this.repository).findOne({
      where: { id },
      relations: { product: true },
    });
  }

  findAndCount(query: BatchQueryDto): Promise<[BatchEntity[], number]> {
    const builder = this.repository
      .createQueryBuilder('batch')
      .leftJoinAndSelect('batch.product', 'product');

    if (query.productId) {
      builder.andWhere('batch.productId = :productId', { productId: query.productId });
    }
    if (query.search) {
      builder.andWhere('batch.code ILIKE :search', { search: `%${query.search}%` });
    }

    return builder
      .orderBy('product.name', 'ASC')
      .addOrderBy('batch.code', 'ASC')
      .addOrderBy('batch.expirationDate', 'ASC')
      .addOrderBy('batch.id', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
  }

  existsByCode(
    productId: string,
    code: string,
    excludeId?: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    const builder = (manager?.getRepository(BatchEntity) ?? this.repository)
      .createQueryBuilder('batch')
      .where('batch.productId = :productId', { productId })
      .andWhere('LOWER(batch.code) = LOWER(:code)', { code });
    if (excludeId) {
      builder.andWhere('batch.id <> :excludeId', { excludeId });
    }
    return builder.getExists();
  }

  save(batch: BatchEntity, manager?: EntityManager): Promise<BatchEntity> {
    return (manager?.getRepository(BatchEntity) ?? this.repository).save(batch);
  }
}
