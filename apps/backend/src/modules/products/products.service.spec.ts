import { DataSource, EntityManager } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { AuditRecordInput } from '../audit/audit.types';
import { ProductEntity } from './entities/product.entity';
import { ProductsRepository } from './products.repository';
import { ProductsService } from './products.service';

describe('ProductsService', () => {
  const manager = {} as EntityManager;
  const repository = {
    existsByCode: jest.fn(),
    save: jest.fn(),
    findById: jest.fn(),
  };
  const audit = { record: jest.fn<Promise<void>, [AuditRecordInput]>() };
  const dataSource = {
    transaction: jest.fn((operation: (entityManager: EntityManager) => unknown) => operation(manager)),
  };
  const service = new ProductsService(
    repository as unknown as ProductsRepository,
    audit as unknown as AuditService,
    dataSource as unknown as DataSource,
  );

  beforeEach(() => jest.clearAllMocks());

  it('cria produto ativo e registra auditoria na mesma transacao', async () => {
    repository.existsByCode.mockResolvedValue(false);
    repository.save.mockImplementation((product: ProductEntity) => Promise.resolve(product));

    const product = await service.create(
      { code: 'P001', name: 'Produto teste', defaultUnit: 'UN' },
      '10000000-0000-4000-8000-000000000001',
      { requestId: 'request-1', ipAddress: null, userAgent: null },
    );

    expect(product).toMatchObject({ code: 'P001', active: true });
    expect(repository.save).toHaveBeenCalledWith(product, manager);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      manager,
      action: 'PRODUCT_CREATE',
      entityId: product.id,
    }));
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
