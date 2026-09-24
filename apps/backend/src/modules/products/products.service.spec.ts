import { BadRequestException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { AuditRecordInput } from '../audit/audit.types';
import { ProductEntity } from './entities/product.entity';
import { ProductsRepository } from './products.repository';
import { ProductsService } from './products.service';

describe('ProductsService', () => {
  const manager = { query: jest.fn().mockResolvedValue([]) } as unknown as EntityManager;
  const repository = {
    existsByCode: jest.fn(),
    save: jest.fn(),
    findById: jest.fn(),
  };
  const audit = { record: jest.fn<Promise<void>, [AuditRecordInput]>() };
  const dataSource = {
    transaction: jest.fn((operation: (entityManager: EntityManager) => unknown) => operation(manager)),
    getRepository: jest.fn(),
  };
  const service = new ProductsService(
    repository as unknown as ProductsRepository,
    audit as unknown as AuditService,
    dataSource as unknown as DataSource,
  );

  beforeEach(() => jest.clearAllMocks());

  it('pagina o log de produtos com filtro e sem metadados sensíveis', async () => {
    const event = { id: 'event-1', entityId: 'product-1', action: 'PRODUCT_UPDATE', createdAt: new Date('2026-09-24T12:00:00Z'), oldValues: { name: 'Antes' }, newValues: { name: 'Depois' }, user: { username: 'operador' } };
    const qb = {
      leftJoinAndSelect: jest.fn(), select: jest.fn(), where: jest.fn(), andWhere: jest.fn(),
      orderBy: jest.fn(), addOrderBy: jest.fn(), skip: jest.fn(), take: jest.fn(),
      getManyAndCount: jest.fn().mockResolvedValue([[event], 1]),
    };
    for (const key of ['leftJoinAndSelect', 'select', 'where', 'andWhere', 'orderBy', 'addOrderBy', 'skip', 'take'] as const) qb[key].mockReturnValue(qb);
    dataSource.getRepository.mockReturnValue({ createQueryBuilder: () => qb });
    const result = await service.auditHistory({ productId: 'product-1', page: 2, limit: 1 });
    expect(result.meta).toMatchObject({ page: 2, limit: 1, total: 1 });
    expect(qb.andWhere).toHaveBeenCalledWith('audit.entityId = :productId', { productId: 'product-1' });
    expect(qb.skip).toHaveBeenCalledWith(1);
    expect(result.items[0]).toEqual({ id: 'event-1', productId: 'product-1', action: 'PRODUCT_UPDATE', createdAt: event.createdAt, username: 'operador', oldValues: event.oldValues, newValues: event.newValues });
  });

  it('cria produto ativo e registra auditoria na mesma transacao', async () => {
    repository.existsByCode.mockResolvedValue(false);
    repository.save.mockImplementation((product: ProductEntity) => Promise.resolve(product));

    const product = await service.create(
      { code: 'P001', name: 'Produto teste', defaultUnit: 'UN', unitWeightGrams: 350, shelfLifeYears: 3 },
      '10000000-0000-4000-8000-000000000001',
      { requestId: 'request-1', ipAddress: null, userAgent: null },
    );

    expect(product).toMatchObject({ code: 'P001', unitWeightGrams: 350, active: true });
    expect(repository.save).toHaveBeenCalledWith(product, manager);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      manager,
      action: 'PRODUCT_CREATE',
      entityId: product.id,
    }));
  });

  it('exige gramatura em UN e rejeita gramatura em embalagem', async () => {
    repository.existsByCode.mockResolvedValue(false);
    await expect(service.create(
      { code: 'UN-SEM-PESO', name: 'Sem peso', defaultUnit: 'UN', shelfLifeYears: 3 },
      '10000000-0000-4000-8000-000000000001',
      { requestId: 'request-weight-1', ipAddress: null, userAgent: null },
    )).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create(
      { code: 'CX-COM-PESO', name: 'Caixa', defaultUnit: 'CX', unitWeightGrams: 350, shelfLifeYears: 3, unitsPerPackage: 12, unitProductIds: ['10000000-0000-4000-8000-000000000099'] },
      '10000000-0000-4000-8000-000000000001',
      { requestId: 'request-weight-2', ipAddress: null, userAgent: null },
    )).rejects.toBeInstanceOf(BadRequestException);
  });

  it('inativa sem excluir o produto e registra a mudanca', async () => {
    const product = Object.assign(new ProductEntity(), {
      code: 'P001', name: 'Produto teste', defaultUnit: 'UN', active: true,
    });
    repository.findById.mockResolvedValue(product);
    repository.save.mockImplementation((entity: ProductEntity) => Promise.resolve(entity));

    const result = await service.setStatus(
      product.id,
      false,
      '10000000-0000-4000-8000-000000000001',
      { requestId: 'request-2', ipAddress: null, userAgent: null },
    );

    expect(result.active).toBe(false);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      action: 'PRODUCT_DEACTIVATE',
    }));
    const recorded = audit.record.mock.calls.at(-1)?.[0];
    expect(recorded?.oldValues).toEqual(expect.objectContaining({ active: true }));
    expect(recorded?.newValues).toEqual(expect.objectContaining({ active: false }));
  });
});
