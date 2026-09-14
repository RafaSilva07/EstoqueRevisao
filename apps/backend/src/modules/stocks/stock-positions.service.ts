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
    await this.validateReferences(key, manager, true);
    return this.positionsRepository.addAtomic(key, quantity, manager);
  }

  async restoreQuantity(key: StockPositionKey, quantity: number, manager: EntityManager): Promise<StockPositionEntity> {
    this.validateQuantity(quantity);
    await this.validateReferences(key, manager, false);
    return this.positionsRepository.addAtomic(key, quantity, manager);
  }

  async removeQuantity(
    key: StockPositionKey,
    quantity: number,
    manager: EntityManager,
  ): Promise<StockPositionEntity> {
    this.validateQuantity(quantity);
    await this.validateReferences(key, manager, false);
    const position = await this.positionsRepository.removeAtomic(key, quantity, manager);
    if (!position) throw await this.insufficientStockException(key, manager);
    return position;
  }

  async transferQuantity(
    source: StockPositionKey,
    destination: StockPositionKey,
    quantity: number,
    manager: EntityManager,
  ): Promise<{ source: StockPositionEntity; destination: StockPositionEntity }> {
    this.validateQuantity(quantity);
    if (
      source.productId !== destination.productId
      || (
        source.batchId === destination.batchId
        && source.stockLocationId === destination.stockLocationId
      )
    ) {
      throw new BadRequestException({
        code: 'INVALID_STOCK_TRANSFER',
        message: 'A transferencia deve manter o produto e alterar o lote ou o local.',
      });
    }
    await Promise.all([
      this.validateReferences(source, manager, false),
      this.validateReferences(destination, manager, false),
    ]);
    await this.positionsRepository.lockForTransfer(source, destination, manager);
    const updatedSource = await this.positionsRepository.removeAtomic(source, quantity, manager);
    if (!updatedSource) throw await this.insufficientStockException(source, manager);
    const updatedDestination = await this.positionsRepository.addAtomic(
      destination,
      quantity,
      manager,
    );
    return { source: updatedSource, destination: updatedDestination };
  }

  async distributeQuantity(
    source: StockPositionKey,
    distributions: Array<{ destinationLocationId: string; quantity: number }>,
    quantity: number,
    manager: EntityManager,
  ): Promise<void> {
    this.validateQuantity(quantity);
    if (distributions.length === 0) {
      throw new BadRequestException({
        code: 'EMPTY_STOCK_DISTRIBUTION',
        message: 'Informe ao menos um destino para a quantidade revisada.',
      });
    }

    const destinationIds = new Set<string>();
    let distributedUnits = 0;
    for (const distribution of distributions) {
      this.validateQuantity(distribution.quantity);
      if (
        distribution.destinationLocationId === source.stockLocationId
        || destinationIds.has(distribution.destinationLocationId)
      ) {
        throw new BadRequestException({
          code: 'INVALID_STOCK_DISTRIBUTION_DESTINATION',
          message: 'Os destinos devem ser diferentes da origem e nao podem se repetir.',
        });
      }
      destinationIds.add(distribution.destinationLocationId);
      distributedUnits += this.toQuantityUnits(distribution.quantity);
    }
    if (distributedUnits !== this.toQuantityUnits(quantity)) {
      throw new BadRequestException({
        code: 'INVALID_STOCK_DISTRIBUTION_TOTAL',
        message: 'A soma dos destinos deve ser exatamente igual a quantidade revisada.',
      });
    }

    await this.validateReferences(source, manager, false);
    for (const destinationLocationId of [...destinationIds].sort()) {
      await this.validateReferences({ ...source, stockLocationId: destinationLocationId }, manager, false);
    }
    await this.positionsRepository.lockForDistribution(source, [...destinationIds], manager);
    const updatedSource = await this.positionsRepository.removeAtomic(source, quantity, manager);
    if (!updatedSource) throw await this.insufficientStockException(source, manager);
    for (const distribution of [...distributions].sort((left, right) => (
      left.destinationLocationId.localeCompare(right.destinationLocationId)
    ))) {
      await this.positionsRepository.addAtomic({
        ...source,
        stockLocationId: distribution.destinationLocationId,
      }, distribution.quantity, manager);
    }
  }

  async restoreDistributedQuantity(
    source: StockPositionKey,
    distributions: Array<{ destinationLocationId: string; quantity: number }>,
    quantity: number,
    manager: EntityManager,
  ): Promise<void> {
    this.validateQuantity(quantity);
    const destinationIds = new Set<string>();
    let distributedUnits = 0;
    for (const distribution of distributions) {
      this.validateQuantity(distribution.quantity);
      if (
        distribution.destinationLocationId === source.stockLocationId
        || destinationIds.has(distribution.destinationLocationId)
      ) {
        throw new BadRequestException({
          code: 'INVALID_STOCK_DISTRIBUTION_DESTINATION',
          message: 'Os destinos devem ser diferentes da origem e nao podem se repetir.',
        });
      }
      destinationIds.add(distribution.destinationLocationId);
      distributedUnits += this.toQuantityUnits(distribution.quantity);
    }
    if (
      destinationIds.size === 0
      || distributedUnits !== this.toQuantityUnits(quantity)
    ) {
      throw new BadRequestException({
        code: 'INVALID_STOCK_DISTRIBUTION_TOTAL',
        message: 'A soma dos destinos deve ser exatamente igual a quantidade revisada.',
      });
    }

    await this.validateReferences(source, manager, false);
    for (const destinationLocationId of [...destinationIds].sort()) {
      await this.validateReferences({ ...source, stockLocationId: destinationLocationId }, manager, false);
    }
    await this.positionsRepository.lockForDistribution(source, [...destinationIds], manager);
    for (const distribution of [...distributions].sort((left, right) => (
      left.destinationLocationId.localeCompare(right.destinationLocationId)
    ))) {
      const destination = { ...source, stockLocationId: distribution.destinationLocationId };
      const updated = await this.positionsRepository.removeAtomic(
        destination,
        distribution.quantity,
        manager,
      );
      if (!updated) throw await this.insufficientStockException(destination, manager);
    }
    await this.positionsRepository.addAtomic(source, quantity, manager);
  }

  private async insufficientStockException(
    key: StockPositionKey,
    manager: EntityManager,
  ): Promise<ConflictException> {
    const available = await this.getBalance(key, manager);
    return new ConflictException({
      code: 'INSUFFICIENT_STOCK',
      message: `Saldo insuficiente. Disponivel: ${available}.`,
      available,
    });
  }

  private validateQuantity(quantity: number): void {
    if (
      !Number.isFinite(quantity)
      || quantity <= 0
      || !Number.isInteger(quantity)
    ) {
      throw new BadRequestException({
        code: 'INVALID_STOCK_QUANTITY',
        message: 'A quantidade deve ser um numero inteiro positivo.',
      });
    }
  }

  private toQuantityUnits(quantity: number): number {
    return quantity;
  }

  private async validateReferences(
    key: StockPositionKey,
    manager: EntityManager,
    requireActiveProduct: boolean,
  ): Promise<void> {
    const product = await this.productsRepository.findById(key.productId, manager);
    const batch = await this.batchesRepository.findById(key.batchId, manager);
    const location = await this.locationsRepository.findById(key.stockLocationId, manager);
    if (
      !product
      || (requireActiveProduct && !product.active)
      || !batch
      || batch.productId !== key.productId
    ) {
      throw new BadRequestException({
        code: 'INVALID_STOCK_PRODUCT_BATCH',
        message: requireActiveProduct
          ? 'O produto ativo e o lote informados nao possuem uma associacao valida.'
          : 'O produto e o lote informados nao possuem uma associacao valida.',
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
