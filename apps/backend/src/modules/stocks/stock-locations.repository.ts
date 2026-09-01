import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { StockLocationQueryDto } from './dto/stock-location-query.dto';
import { StockLocationEntity } from './entities/stock-location.entity';

@Injectable()
export class StockLocationsRepository {
  constructor(
    @InjectRepository(StockLocationEntity)
    private readonly repository: Repository<StockLocationEntity>,
  ) {}

  findById(id: string, manager?: EntityManager): Promise<StockLocationEntity | null> {
    return (manager?.getRepository(StockLocationEntity) ?? this.repository).findOne({
      where: { id },
      relations: { parent: true, children: true },
    });
  }

  findAndCount(query: StockLocationQueryDto): Promise<[StockLocationEntity[], number]> {
    const builder = this.repository
      .createQueryBuilder('location')
      .leftJoinAndSelect('location.parent', 'parent');

    if (query.search) {
      builder.andWhere(
        '(location.code ILIKE :search OR location.name ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.kind) {
      builder.andWhere('location.kind = :kind', { kind: query.kind });
    }
    if (query.active !== undefined) {
      builder.andWhere('location.active = :active', { active: query.active });
    }

    return builder
      .orderBy('location.kind', 'ASC')
      .addOrderBy('location.name', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
  }

  existsByCode(code: string, excludeId?: string, manager?: EntityManager): Promise<boolean> {
    const builder = (manager?.getRepository(StockLocationEntity) ?? this.repository)
      .createQueryBuilder('location')
      .where('LOWER(location.code) = LOWER(:code)', { code });
    if (excludeId) {
      builder.andWhere('location.id <> :excludeId', { excludeId });
    }
    return builder.getExists();
  }

  hasActiveChildren(id: string, manager?: EntityManager): Promise<boolean> {
    return (manager?.getRepository(StockLocationEntity) ?? this.repository)
      .createQueryBuilder('location')
      .where('location.parentId = :id', { id })
      .andWhere('location.active = true')
      .getExists();
  }

  save(location: StockLocationEntity, manager?: EntityManager): Promise<StockLocationEntity> {
    return (manager?.getRepository(StockLocationEntity) ?? this.repository).save(location);
  }
}
