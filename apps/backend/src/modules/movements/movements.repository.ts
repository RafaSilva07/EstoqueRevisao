import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository, SelectQueryBuilder } from 'typeorm';
import { MovementQueryDto } from './dto/movement-query.dto';
import { MovementItemEntity } from './entities/movement-item.entity';
import { MovementEntity } from './entities/movement.entity';
import { MovementItemDistributionEntity } from './entities/movement-item-distribution.entity';

@Injectable()
export class MovementsRepository {
  constructor(
    @InjectRepository(MovementEntity) private readonly repository: Repository<MovementEntity>,
  ) {}

  save(movement: MovementEntity, manager: EntityManager): Promise<MovementEntity> {
    return manager.getRepository(MovementEntity).save(movement);
  }

  saveItems(items: MovementItemEntity[], manager: EntityManager): Promise<MovementItemEntity[]> {
    return manager.getRepository(MovementItemEntity).save(items);
  }

  saveDistributions(
    distributions: MovementItemDistributionEntity[],
    manager: EntityManager,
  ): Promise<MovementItemDistributionEntity[]> {
    return manager.getRepository(MovementItemDistributionEntity).save(distributions);
  }

  findByRequestKey(requestKey: string): Promise<MovementEntity | null> {
    return this.detailBuilder().where('movement.requestKey = :requestKey', { requestKey }).getOne();
  }

  findById(id: string): Promise<MovementEntity | null> {
    return this.detailBuilder().where('movement.id = :id', { id }).getOne();
  }

  async findAndCount(query: MovementQueryDto): Promise<[MovementEntity[], number]> {
    const builder = this.repository
      .createQueryBuilder('movement')
      .innerJoinAndSelect('movement.originLocation', 'origin')
      .leftJoinAndSelect('movement.destinationLocation', 'destination')
      .innerJoinAndSelect('movement.responsibleUser', 'responsible')
      .leftJoinAndSelect('movement.items', 'item')
      .leftJoinAndSelect('item.product', 'product')
      .leftJoinAndSelect('item.batch', 'batch')
      .leftJoinAndSelect('item.distributions', 'distribution')
      .leftJoinAndSelect('distribution.destinationLocation', 'distributionDestination')
      .distinct(true);

    if (query.dateFrom) builder.andWhere('movement.occurredAt >= :dateFrom', { dateFrom: query.dateFrom });
    if (query.dateTo) builder.andWhere('movement.occurredAt <= :dateTo', { dateTo: query.dateTo });
    if (query.type) builder.andWhere('movement.type = :type', { type: query.type });
    if (query.originLocationId) builder.andWhere('movement.originLocationId = :originLocationId', { originLocationId: query.originLocationId });
    if (query.destinationLocationId) {
      builder.andWhere(
        `(
          movement.destinationLocationId = :destinationLocationId
          OR EXISTS (
            SELECT 1
            FROM movement_items filtered_item
            INNER JOIN movement_item_distributions filtered_distribution
              ON filtered_distribution.movement_item_id = filtered_item.id
            WHERE filtered_item.movement_id = movement.id
              AND filtered_distribution.destination_location_id = :destinationLocationId
          )
        )`,
        { destinationLocationId: query.destinationLocationId },
      );
    }
    if (query.productId) {
      builder.andWhere(
        `EXISTS (
          SELECT 1
          FROM movement_items filtered_product_item
          WHERE filtered_product_item.movement_id = movement.id
            AND filtered_product_item.product_id = :productId
        )`,
        { productId: query.productId },
      );
    }

    return builder.orderBy('movement.occurredAt', 'DESC')
      .addOrderBy('movement.createdAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
  }

  private detailBuilder(): SelectQueryBuilder<MovementEntity> {
    return this.repository.createQueryBuilder('movement')
      .innerJoinAndSelect('movement.originLocation', 'origin')
      .leftJoinAndSelect('movement.destinationLocation', 'destination')
      .innerJoinAndSelect('movement.responsibleUser', 'responsible')
      .leftJoinAndSelect('movement.items', 'item')
      .leftJoinAndSelect('item.product', 'product')
      .leftJoinAndSelect('item.batch', 'batch')
      .leftJoinAndSelect('item.distributions', 'distribution')
      .leftJoinAndSelect('distribution.destinationLocation', 'distributionDestination')
      .orderBy('item.id', 'ASC')
      .addOrderBy('distributionDestination.name', 'ASC');
  }
}
