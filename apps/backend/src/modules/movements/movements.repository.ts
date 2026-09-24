import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository, SelectQueryBuilder } from 'typeorm';
import { ProductEntity } from '../products/entities/product.entity';
import { MovementQueryDto } from './dto/movement-query.dto';
import { MovementItemEntity } from './entities/movement-item.entity';
import { MovementEntity } from './entities/movement.entity';
import { MovementItemDistributionEntity } from './entities/movement-item-distribution.entity';
import { PcpExecutionStatus } from '../pcp/domain/pcp-execution-status.enum';

@Injectable()
export class MovementsRepository {
  constructor(
    @InjectRepository(MovementEntity) private readonly repository: Repository<MovementEntity>,
  ) {}

  async save(movement: MovementEntity, manager: EntityManager): Promise<MovementEntity> {
    const repository = manager.getRepository(MovementEntity);
    await repository.save(movement);
    const persisted = await repository.findOneByOrFail({ id: movement.id });
    movement.codigoMovimentacao = persisted.codigoMovimentacao;
    return movement;
  }

  async saveItems(items: MovementItemEntity[], manager: EntityManager): Promise<MovementItemEntity[]> {
    const products = await manager.getRepository(ProductEntity).findBy({ id: In([...new Set(items.map((item) => item.productId))]) });
    const byId = new Map(products.map((product) => [product.id, product]));
    for (const item of items) {
      const product = byId.get(item.productId)!;
      item.productSnapshot ??= { code: product.code, name: product.name, defaultUnit: product.defaultUnit };
    }
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

  async findByIdForUpdate(id: string, manager: EntityManager): Promise<MovementEntity | null> {
    const transactionalRepository = manager.getRepository(MovementEntity);
    const locked = await transactionalRepository.createQueryBuilder('movement')
      .where('movement.id = :id', { id })
      .setLock('pessimistic_write')
      .getOne();
    if (!locked) return null;
    return this.detailBuilder(transactionalRepository).where('movement.id = :id', { id }).getOne();
  }

  async findAndCount(query: MovementQueryDto): Promise<[MovementEntity[], number]> {
    const builder = this.repository
      .createQueryBuilder('movement')
      .innerJoinAndSelect('movement.originLocation', 'origin')
      .leftJoinAndSelect('movement.destinationLocation', 'destination')
      .innerJoinAndSelect('movement.responsibleUser', 'responsible')
      .leftJoinAndSelect('movement.pcpExecutedByUser', 'pcpExecutedBy')
      .leftJoinAndSelect('movement.canceledByUser', 'canceledBy')
      .leftJoinAndSelect('movement.items', 'item')
      .leftJoinAndSelect('item.product', 'product')
      .leftJoinAndSelect('item.batch', 'batch')
      .leftJoinAndSelect('item.destinationBatch', 'destinationBatch')
      .leftJoinAndSelect('item.outputProduct', 'outputProduct')
      .leftJoinAndSelect('item.outputBatch', 'outputBatch')
      .leftJoinAndSelect('item.distributions', 'distribution')
      .leftJoinAndSelect('distribution.destinationLocation', 'distributionDestination')
      .distinct(true);

    if (query.dateFrom) builder.andWhere('movement.occurredAt >= :dateFrom', { dateFrom: query.dateFrom });
    if (query.dateTo) builder.andWhere('movement.occurredAt <= :dateTo', { dateTo: query.dateTo });
    if (query.type) builder.andWhere('movement.type = :type', { type: query.type });
    if (query.codigoMovimentacao) builder.andWhere('movement.codigoMovimentacao = :codigo', { codigo: query.codigoMovimentacao.trim().toUpperCase() });
    if (query.status) builder.andWhere('movement.status = :status', { status: query.status });
    if (query.pcpStatus) builder.andWhere('movement.pcpExecutionStatus = :pcpStatus', { pcpStatus: query.pcpStatus });
    if (query.pcpStatus === PcpExecutionStatus.Pending) builder.andWhere('movement.requiresPcpExecution = true');
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
            AND (filtered_product_item.product_id = :productId OR filtered_product_item.output_product_id = :productId)
        )`,
        { productId: query.productId },
      );
    }

    const primary = query.sort === 'TYPE' ? 'movement.type' : 'movement.occurredAt';
    const direction = query.sort === 'OLDEST' || query.sort === 'TYPE' ? 'ASC' : 'DESC';
    return builder.orderBy(primary, direction)
      .addOrderBy('movement.createdAt', direction)
      .addOrderBy('movement.id', direction)
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
  }

  private detailBuilder(repository = this.repository): SelectQueryBuilder<MovementEntity> {
    return repository.createQueryBuilder('movement')
      .innerJoinAndSelect('movement.originLocation', 'origin')
      .leftJoinAndSelect('movement.destinationLocation', 'destination')
      .innerJoinAndSelect('movement.responsibleUser', 'responsible')
      .leftJoinAndSelect('movement.pcpExecutedByUser', 'pcpExecutedBy')
      .leftJoinAndSelect('movement.canceledByUser', 'canceledBy')
      .leftJoinAndSelect('movement.items', 'item')
      .leftJoinAndSelect('item.product', 'product')
      .leftJoinAndSelect('item.batch', 'batch')
      .leftJoinAndSelect('item.destinationBatch', 'destinationBatch')
      .leftJoinAndSelect('item.outputProduct', 'outputProduct')
      .leftJoinAndSelect('item.outputBatch', 'outputBatch')
      .leftJoinAndSelect('item.distributions', 'distribution')
      .leftJoinAndSelect('distribution.destinationLocation', 'distributionDestination')
      .orderBy('item.id', 'ASC')
      .addOrderBy('distributionDestination.name', 'ASC');
  }
}
