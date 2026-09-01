import { BadRequestException, ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { BatchesRepository } from '../batches/batches.repository';
import { BatchEntity } from '../batches/entities/batch.entity';
import { ProductEntity } from '../products/entities/product.entity';
import { ProductsRepository } from '../products/products.repository';
import { StockLocationKind } from './domain/stock-location-kind.enum';
import { StockLocationEntity } from './entities/stock-location.entity';
import { StockPositionEntity } from './entities/stock-position.entity';
import { StockLocationsRepository } from './stock-locations.repository';
import { StockPositionsRepository } from './stock-positions.repository';
import { StockPositionsService } from './stock-positions.service';

describe('StockPositionsService', () => {
  const manager = {} as EntityManager;
  const key = {
    productId: '10000000-0000-4000-8000-000000000001',
    batchId: '10000000-0000-4000-8000-000000000002',
    stockLocationId: '10000000-0000-4000-8000-000000000003',
  };
  const position = Object.assign(new StockPositionEntity(), key, { quantity: 10 });
  const positions = {
    findAndCount: jest.fn(),
    findById: jest.fn(),
    findByKey: jest.fn(),
    addAtomic: jest.fn(),
    removeAtomic: jest.fn(),
  };
  const products = { findById: jest.fn() };
  const batches = { findById: jest.fn() };
  const locations = { findById: jest.fn() };
  const service = new StockPositionsService(
    positions as unknown as StockPositionsRepository,
    products as unknown as ProductsRepository,
    batches as unknown as BatchesRepository,
    locations as unknown as StockLocationsRepository,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    products.findById.mockResolvedValue(Object.assign(new ProductEntity(), { id: key.productId }));
    batches.findById.mockResolvedValue(Object.assign(new BatchEntity(), {
      id: key.batchId,
      productId: key.productId,
    }));
    locations.findById.mockResolvedValue(Object.assign(new StockLocationEntity(), {
      id: key.stockLocationId,
      kind: StockLocationKind.Substock,
    }));
  });

  it('cria logicamente a posicao ao adicionar quantidade', async () => {
    positions.addAtomic.mockResolvedValue(position);
    await expect(service.addQuantity(key, 10, manager)).resolves.toBe(position);
    expect(positions.addAtomic).toHaveBeenCalledWith(key, 10, manager);
  });

  it('adiciona quantidade pela operacao atomica central', async () => {
    positions.addAtomic.mockResolvedValue(Object.assign(position, { quantity: 15 }));
    const result = await service.addQuantity(key, 5, manager);
    expect(result.quantity).toBe(15);
  });

  it('remove uma quantidade disponivel', async () => {
    positions.removeAtomic.mockResolvedValue(Object.assign(position, { quantity: 4 }));
    const result = await service.removeQuantity(key, 6, manager);
    expect(result.quantity).toBe(4);
    expect(positions.removeAtomic).toHaveBeenCalledWith(key, 6, manager);
  });

  it('rejeita remocao superior ao saldo disponivel', async () => {
    positions.removeAtomic.mockResolvedValue(null);
    await expect(service.removeQuantity(key, 11, manager))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it.each([0, -1, 0.0000001])('rejeita quantidade invalida: %s', async (quantity) => {
    await expect(service.addQuantity(key, quantity, manager))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(positions.addAtomic).not.toHaveBeenCalled();
  });

  it('rejeita produto que nao pertence ao lote', async () => {
    batches.findById.mockResolvedValue(Object.assign(new BatchEntity(), {
      id: key.batchId,
      productId: '10000000-0000-4000-8000-000000000099',
    }));
    await expect(service.addQuantity(key, 1, manager))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('combina os filtros de consulta', async () => {
    positions.findAndCount.mockResolvedValue([[position], 1]);
    const query = { ...key, page: 1, limit: 20 };
    const result = await service.list(query);
    expect(positions.findAndCount).toHaveBeenCalledWith(query);
    expect(result.meta.total).toBe(1);
  });
});
