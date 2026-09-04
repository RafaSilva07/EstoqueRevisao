import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { StockPositionQueryDto } from './dto/stock-position-query.dto';
import { StockPositionEntity } from './entities/stock-position.entity';

export interface StockPositionKey {
  productId: string;
  batchId: string;
  stockLocationId: string;
}

@Injectable()
export class StockPositionsRepository {
  constructor(
    @InjectRepository(StockPositionEntity)
    private readonly repository: Repository<StockPositionEntity>,
  ) {}

  findAndCount(query: StockPositionQueryDto): Promise<[StockPositionEntity[], number]> {
    const builder = this.repository
      .createQueryBuilder('position')
      .innerJoinAndSelect('position.product', 'product')
      .innerJoinAndSelect('position.batch', 'batch')
      .innerJoinAndSelect('position.stockLocation', 'stockLocation')
      .where('position.quantity > 0');

    if (query.productId) {
      builder.andWhere('position.productId = :productId', { productId: query.productId });
    }
    if (query.batchId) {
      builder.andWhere('position.batchId = :batchId', { batchId: query.batchId });
    }
    if (query.stockLocationId) {
      builder.andWhere('position.stockLocationId = :stockLocationId', {
        stockLocationId: query.stockLocationId,
      });
    }

    return builder
      .orderBy('product.name', 'ASC')
      .addOrderBy('batch.manufacturingDate', 'ASC')
      .addOrderBy('stockLocation.name', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
  }

  findById(id: string, manager?: EntityManager): Promise<StockPositionEntity | null> {
    return (manager?.getRepository(StockPositionEntity) ?? this.repository).findOne({
      where: { id },
      relations: { product: true, batch: true, stockLocation: true },
    });
  }

  findByKey(key: StockPositionKey, manager?: EntityManager): Promise<StockPositionEntity | null> {
    return (manager?.getRepository(StockPositionEntity) ?? this.repository).findOne({
      where: key,
      relations: { product: true, batch: true, stockLocation: true },
    });
  }

  async addAtomic(
    key: StockPositionKey,
    quantity: number,
    manager: EntityManager,
  ): Promise<StockPositionEntity> {
    const id = new StockPositionEntity().id;
    await manager.query(
      `
        INSERT INTO "stock_positions" (
          "id", "product_id", "batch_id", "stock_location_id", "quantity"
        ) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT ("product_id", "batch_id", "stock_location_id")
        DO UPDATE SET
          "quantity" = "stock_positions"."quantity" + EXCLUDED."quantity",
          "updated_at" = CURRENT_TIMESTAMP
      `,
      [id, key.productId, key.batchId, key.stockLocationId, quantity],
    );
    return this.requireByKey(key, manager);
  }

  async removeAtomic(
    key: StockPositionKey,
    quantity: number,
    manager: EntityManager,
  ): Promise<StockPositionEntity | null> {
    const result = await manager
      .createQueryBuilder()
      .update(StockPositionEntity)
      .set({
        quantity: () => '"quantity" - :quantity',
        updatedAt: () => 'CURRENT_TIMESTAMP',
      })
      .where('"product_id" = :productId', { productId: key.productId })
      .andWhere('"batch_id" = :batchId', { batchId: key.batchId })
      .andWhere('"stock_location_id" = :stockLocationId', {
        stockLocationId: key.stockLocationId,
      })
      .andWhere('"quantity" >= :quantity', { quantity })
      .execute();
    if (!result.affected) {
      return null;
    }
    return this.requireByKey(key, manager);
  }

  async lockForTransfer(
    source: StockPositionKey,
    destination: StockPositionKey,
    manager: EntityManager,
  ): Promise<void> {
    await manager.getRepository(StockPositionEntity)
      .createQueryBuilder('position')
      .where(`(
        position.productId = :sourceProductId
        AND position.batchId = :sourceBatchId
        AND position.stockLocationId = :sourceLocationId
      )`, {
        sourceProductId: source.productId,
        sourceBatchId: source.batchId,
        sourceLocationId: source.stockLocationId,
      })
      .orWhere(`(
        position.productId = :destinationProductId
        AND position.batchId = :destinationBatchId
        AND position.stockLocationId = :destinationLocationId
      )`, {
        destinationProductId: destination.productId,
        destinationBatchId: destination.batchId,
        destinationLocationId: destination.stockLocationId,
      })
      .orderBy('position.productId', 'ASC')
      .addOrderBy('position.batchId', 'ASC')
      .addOrderBy('position.stockLocationId', 'ASC')
      .setLock('pessimistic_write')
      .getMany();
  }

  async lockForDistribution(
    source: StockPositionKey,
    destinationLocationIds: string[],
    manager: EntityManager,
  ): Promise<void> {
    await manager.getRepository(StockPositionEntity)
      .createQueryBuilder('position')
      .where('position.productId = :productId', { productId: source.productId })
      .andWhere('position.batchId = :batchId', { batchId: source.batchId })
      .andWhere('position.stockLocationId IN (:...locationIds)', {
        locationIds: [source.stockLocationId, ...destinationLocationIds].sort(),
      })
      .orderBy('position.stockLocationId', 'ASC')
      .setLock('pessimistic_write')
      .getMany();
  }

  private async requireByKey(
    key: StockPositionKey,
    manager: EntityManager,
  ): Promise<StockPositionEntity> {
    const position = await this.findByKey(key, manager);
    if (!position) {
      throw new Error('A posicao de estoque nao foi encontrada apos a atualizacao atomica.');
    }
    return position;
  }
}
