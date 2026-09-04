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
    lockForTransfer: jest.fn(),
    lockForDistribution: jest.fn(),
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

  describe('transferencia interna', () => {
    const destination = {
      ...key,
      stockLocationId: '10000000-0000-4000-8000-000000000004',
    };

    beforeEach(() => {
      positions.lockForTransfer.mockResolvedValue(undefined);
      positions.removeAtomic.mockResolvedValue(Object.assign(new StockPositionEntity(), key, {
        quantity: 6,
      }));
      positions.addAtomic.mockResolvedValue(Object.assign(new StockPositionEntity(), destination, {
        quantity: 4,
      }));
    });

    it('bloqueia, retira da origem e adiciona a mesma quantidade no destino', async () => {
      const result = await service.transferQuantity(key, destination, 4, manager);
      expect(positions.lockForTransfer).toHaveBeenCalledWith(key, destination, manager);
      expect(positions.removeAtomic).toHaveBeenCalledWith(key, 4, manager);
      expect(positions.addAtomic).toHaveBeenCalledWith(destination, 4, manager);
      expect(result).toMatchObject({ source: { quantity: 6 }, destination: { quantity: 4 } });
    });

    it.each([0, -1, 0.0000001])('rejeita quantidade invalida: %s', async (quantity) => {
      await expect(service.transferQuantity(key, destination, quantity, manager))
        .rejects.toBeInstanceOf(BadRequestException);
      expect(positions.lockForTransfer).not.toHaveBeenCalled();
    });

    it('rejeita origem e destino iguais', async () => {
      await expect(service.transferQuantity(key, key, 1, manager))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('permite trocar o lote mantendo o produto e o local', async () => {
      const destinationBatch = {
        ...key,
        batchId: '10000000-0000-4000-8000-000000000099',
      };
      batches.findById.mockImplementation((id: string) => Promise.resolve(
        Object.assign(new BatchEntity(), { id, productId: key.productId }),
      ));
      positions.addAtomic.mockResolvedValue(Object.assign(
        new StockPositionEntity(),
        destinationBatch,
        { quantity: 4 },
      ));
      await expect(service.transferQuantity(key, destinationBatch, 4, manager))
        .resolves.toMatchObject({ source: { quantity: 6 }, destination: { quantity: 4 } });
      expect(positions.lockForTransfer).toHaveBeenCalledWith(key, destinationBatch, manager);
      expect(positions.addAtomic).toHaveBeenCalledWith(destinationBatch, 4, manager);
    });

    it('rejeita troca para lote de outro produto', async () => {
      const incompatible = {
        productId: key.productId,
        batchId: '10000000-0000-4000-8000-000000000099',
        stockLocationId: destination.stockLocationId,
      };
      batches.findById.mockImplementation((id: string) => Promise.resolve(
        Object.assign(new BatchEntity(), {
          id,
          productId: id === incompatible.batchId
            ? '10000000-0000-4000-8000-000000000098'
            : key.productId,
        }),
      ));
      await expect(service.transferQuantity(key, incompatible, 1, manager))
        .rejects.toBeInstanceOf(BadRequestException);
      expect(positions.removeAtomic).not.toHaveBeenCalled();
    });

    it('nao adiciona no destino quando a origem nao possui saldo', async () => {
      positions.removeAtomic.mockResolvedValue(null);
      positions.findByKey.mockResolvedValue(Object.assign(new StockPositionEntity(), key, {
        quantity: 2,
      }));
      await expect(service.transferQuantity(key, destination, 3, manager))
        .rejects.toBeInstanceOf(ConflictException);
      expect(positions.addAtomic).not.toHaveBeenCalled();
    });
  });

  describe('distribuicao de revisao', () => {
    const destinations = [
      { destinationLocationId: '10000000-0000-4000-8000-000000000004', quantity: 6 },
      { destinationLocationId: '10000000-0000-4000-8000-000000000005', quantity: 4 },
    ];

    beforeEach(() => {
      positions.lockForDistribution.mockResolvedValue(undefined);
      positions.removeAtomic.mockResolvedValue(Object.assign(new StockPositionEntity(), key, {
        quantity: 5,
      }));
      positions.addAtomic.mockResolvedValue(new StockPositionEntity());
    });

    it('retira o total uma vez e adiciona cada parcela apos obter os locks', async () => {
      await service.distributeQuantity(key, destinations, 10, manager);
      expect(positions.lockForDistribution).toHaveBeenCalledWith(
        key,
        destinations.map((item) => item.destinationLocationId),
        manager,
      );
      expect(positions.removeAtomic).toHaveBeenCalledWith(key, 10, manager);
      expect(positions.addAtomic).toHaveBeenCalledTimes(2);
      expect(positions.addAtomic).toHaveBeenCalledWith({
        ...key,
        stockLocationId: destinations[0].destinationLocationId,
      }, 6, manager);
    });

    it('rejeita distribuicao incompleta ou excedente antes de alterar saldo', async () => {
      await expect(service.distributeQuantity(key, destinations, 9, manager))
        .rejects.toMatchObject({ response: { code: 'INVALID_STOCK_DISTRIBUTION_TOTAL' } });
      await expect(service.distributeQuantity(key, destinations, 11, manager))
        .rejects.toMatchObject({ response: { code: 'INVALID_STOCK_DISTRIBUTION_TOTAL' } });
      expect(positions.removeAtomic).not.toHaveBeenCalled();
    });

    it('rejeita destino igual a origem ou repetido', async () => {
      await expect(service.distributeQuantity(key, [
        { destinationLocationId: key.stockLocationId, quantity: 10 },
      ], 10, manager)).rejects.toMatchObject({
        response: { code: 'INVALID_STOCK_DISTRIBUTION_DESTINATION' },
      });
      await expect(service.distributeQuantity(key, [
        { destinationLocationId: destinations[0].destinationLocationId, quantity: 5 },
        { destinationLocationId: destinations[0].destinationLocationId, quantity: 5 },
      ], 10, manager)).rejects.toMatchObject({
        response: { code: 'INVALID_STOCK_DISTRIBUTION_DESTINATION' },
      });
    });

    it('nao adiciona destinos quando o saldo definitivo e insuficiente', async () => {
      positions.removeAtomic.mockResolvedValue(null);
      positions.findByKey.mockResolvedValue(Object.assign(new StockPositionEntity(), key, {
        quantity: 3,
      }));
      await expect(service.distributeQuantity(key, destinations, 10, manager))
        .rejects.toBeInstanceOf(ConflictException);
      expect(positions.addAtomic).not.toHaveBeenCalled();
    });
  });
});
