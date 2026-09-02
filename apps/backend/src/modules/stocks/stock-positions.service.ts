import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { PaginatedResult, paginate } from '../../shared/pagination/paginated-result.interface';
import { BatchesRepository } from '../batches/batches.repository';
import { ProductsRepository } from '../products/products.repository';
import { StockLocationKind } from './domain/stock-location-kind.enum';
import { StockPositionQueryDto } from './dto/stock-position-query.dto';
import { StockPositionEntity } from './entities/stock-position.entity';
import { StockLocationsRepository } from './stock-locations.repository';
import { StockPositionKey, StockPositionsRepository } from './stock-positions.repository';

@Injectable()
export class StockPositionsService {
  constructor(
    private readonly positionsRepository: StockPositionsRepository,
    private readonly productsRepository: ProductsRepository,
    private readonly batchesRepository: BatchesRepository,
    private readonly locationsRepository: StockLocationsRepository,
  ) {}

  async list(query: StockPositionQueryDto): Promise<PaginatedResult<StockPositionEntity>> {
    const [items, total] = await this.positionsRepository.findAndCount(query);
    return paginate(items, total, query.page, query.limit);
  }

  async getById(id: string): Promise<StockPositionEntity> {
    const position = await this.positionsRepository.findById(id);
    if (!position) {
      throw new NotFoundException({
        code: 'STOCK_POSITION_NOT_FOUND',
        message: 'Posicao de estoque nao encontrada.',
      });
    }
    return position;
  }

  async getBalance(key: StockPositionKey, manager?: EntityManager): Promise<number> {
    const position = await this.positionsRepository.findByKey(key, manager);
    return position?.quantity ?? 0;
  }

  async hasAvailable(
    key: StockPositionKey,
    quantity: number,
    manager?: EntityManager,
  ): Promise<boolean> {
    this.validateQuantity(quantity);
    return await this.getBalance(key, manager) >= quantity;
  }

  async addQuantity(
    key: StockPositionKey,
    quantity: number,
    manager: EntityManager,
  ): Promise<StockPositionEntity> {
    this.validateQuantity(quantity);
    await this.validateReferences(key, manager);
    return this.positionsRepository.addAtomic(key, quantity, manager);
  }

  async removeQuantity(
    key: StockPositionKey,
    quantity: number,
    manager: EntityManager,
  ): Promise<StockPositionEntity> {
    this.validateQuantity(quantity);
    await this.validateReferences(key, manager);
    const position = await this.positionsRepository.removeAtomic(key, quantity, manager);
    if (!position) {
      throw new ConflictException({
        code: 'INSUFFICIENT_STOCK',
        message: 'Saldo insuficiente para remover a quantidade informada.',
      });
    }
    return position;
  }

  private validateQuantity(quantity: number): void {
    if (
      !Number.isFinite(quantity)
      || quantity <= 0
      || !Number.isInteger(quantity * 1_000_000)
    ) {
      throw new BadRequestException({
        code: 'INVALID_STOCK_QUANTITY',
        message: 'A quantidade deve ser positiva e possuir no maximo 6 casas decimais.',
      });
    }
  }

  private async validateReferences(key: StockPositionKey, manager: EntityManager): Promise<void> {
    const product = await this.productsRepository.findById(key.productId, manager);
    const batch = await this.batchesRepository.findById(key.batchId, manager);
    const location = await this.locationsRepository.findById(key.stockLocationId, manager);
    if (!product || !batch || batch.productId !== key.productId) {
      throw new BadRequestException({
        code: 'INVALID_STOCK_PRODUCT_BATCH',
        message: 'O produto e o lote informados nao possuem uma associacao valida.',
      });
    }
    if (!location || location.kind === StockLocationKind.External) {
      throw new BadRequestException({
        code: 'INVALID_STOCK_LOCATION',
        message: 'O saldo deve pertencer a um estoque ou subestoque valido.',
      });
    }
  }
}
