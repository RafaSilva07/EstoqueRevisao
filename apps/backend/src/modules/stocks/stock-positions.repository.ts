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
      .innerJoinAndSelect('position.stockLocation', 'stockLocation');

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
    const rows: unknown = await manager.query(
      `
        UPDATE "stock_positions"
        SET "quantity" = "quantity" - $4, "updated_at" = CURRENT_TIMESTAMP
        WHERE "product_id" = $1
          AND "batch_id" = $2
          AND "stock_location_id" = $3
          AND "quantity" >= $4
        RETURNING "id"
      `,
      [key.productId, key.batchId, key.stockLocationId, quantity],
    );
    if (!Array.isArray(rows) || rows.length === 0) {
      return null;
    }
    return this.requireByKey(key, manager);
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
