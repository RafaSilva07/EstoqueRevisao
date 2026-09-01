import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { ProductEntity } from '../products/entities/product.entity';
import { ProductsRepository } from '../products/products.repository';
import { BatchesRepository } from './batches.repository';
import { BatchesService } from './batches.service';
import { BatchCodeCodec } from './domain/batch-code.codec';

describe('BatchesService', () => {
  const manager = {} as EntityManager;
  const batches = { existsByCode: jest.fn(), save: jest.fn() };
  const products = { findById: jest.fn() };
  const audit = { record: jest.fn() };
  const dataSource = {
    transaction: jest.fn((operation: (entityManager: EntityManager) => unknown) => operation(manager)),
  };
  const service = new BatchesService(
    batches as unknown as BatchesRepository,
    products as unknown as ProductsRepository,
    audit as unknown as AuditService,
    dataSource as unknown as DataSource,
    new BatchCodeCodec(),
  );
  const dto = {
    productId: '10000000-0000-4000-8000-000000000001',
    code: 'SOCDNV',
    manufacturingDate: '2026-08-31',
    expirationDate: '2027-01-31',
  };

  beforeEach(() => jest.clearAllMocks());

  it('impede lote sem produto existente', async () => {
    products.findById.mockResolvedValue(null);
    await expect(service.create(dto, 'user-id', {
      requestId: 'request-1', ipAddress: null, userAgent: null,
    })).rejects.toBeInstanceOf(NotFoundException);
    expect(batches.save).not.toHaveBeenCalled();
  });

  it('impede lote para produto inativo', async () => {
    products.findById.mockResolvedValue(Object.assign(new ProductEntity(), { active: false }));
    await expect(service.create(dto, 'user-id', {
      requestId: 'request-1', ipAddress: null, userAgent: null,
    })).rejects.toBeInstanceOf(ConflictException);
    expect(batches.save).not.toHaveBeenCalled();
  });

  it('mantem a associacao obrigatoria entre lote e produto', async () => {
    products.findById.mockResolvedValue(Object.assign(new ProductEntity(), { active: true }));
    batches.existsByCode.mockResolvedValue(false);
    batches.save.mockImplementation((batch: unknown) => Promise.resolve(batch));

    const result = await service.create(dto, 'user-id', {
      requestId: 'request-1', ipAddress: null, userAgent: null,
    });

    expect(result.productId).toBe(dto.productId);
    expect(batches.save).toHaveBeenCalledWith(expect.objectContaining({
      productId: dto.productId,
      code: dto.code,
    }), manager);
  });

  it('gera o lote quando somente a data de fabricacao e informada', async () => {
    products.findById.mockResolvedValue(Object.assign(new ProductEntity(), { active: true }));
    batches.existsByCode.mockResolvedValue(false);
    batches.save.mockImplementation((batch: unknown) => Promise.resolve(batch));

    const result = await service.create({
      productId: dto.productId,
      manufacturingDate: '2026-08-31',
      expirationDate: '2027-01-31',
    }, 'user-id', { requestId: 'request-2', ipAddress: null, userAgent: null });

    expect(result.code).toBe('SOCDNV');
    expect(result.manufacturingDate).toBe('2026-08-31');
  });

  it('rejeita lote divergente da data de fabricacao', async () => {
    await expect(service.create({
      ...dto,
      manufacturingDate: '2026-08-30',
    }, 'user-id', { requestId: 'request-3', ipAddress: null, userAgent: null }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(products.findById).not.toHaveBeenCalled();
  });

  it('rejeita validade anterior a fabricacao', async () => {
    await expect(service.create({
      ...dto,
      expirationDate: '2026-08-30',
    }, 'user-id', { requestId: 'request-4', ipAddress: null, userAgent: null }))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});
