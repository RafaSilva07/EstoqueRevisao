import { BadRequestException, ConflictException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { StockLocationKind } from './domain/stock-location-kind.enum';
import { StockDisplayMode } from './domain/stock-display-mode.enum';
import { StockLocationEntity } from './entities/stock-location.entity';
import { StockLocationsRepository } from './stock-locations.repository';
import { StockLocationsService } from './stock-locations.service';

describe('StockLocationsService', () => {
  const manager = {} as EntityManager;
  const repository = {
    existsByCode: jest.fn(), findById: jest.fn(), hasActiveChildren: jest.fn(), save: jest.fn(),
  };
  const audit = { record: jest.fn() };
  const dataSource = {
    transaction: jest.fn((operation: (entityManager: EntityManager) => unknown) => operation(manager)),
  };
  const service = new StockLocationsService(
    repository as unknown as StockLocationsRepository,
    audit as unknown as AuditService,
    dataSource as unknown as DataSource,
  );

  beforeEach(() => jest.clearAllMocks());

  it('exige estoque pai ativo para um subestoque', async () => {
    repository.existsByCode.mockResolvedValue(false);
    repository.findById.mockResolvedValue(null);
    await expect(service.create({
      code: 'SUB', name: 'Subestoque', kind: StockLocationKind.Substock,
      parentId: '10000000-0000-4000-8000-000000000001',
    }, 'user-id', { requestId: 'request-1', ipAddress: null, userAgent: null }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('protege a integridade ao inativar estoque com filhos ativos', async () => {
    repository.findById.mockResolvedValue(Object.assign(new StockLocationEntity(), {
      kind: StockLocationKind.Stock, active: true, parentId: null,
    }));
    repository.hasActiveChildren.mockResolvedValue(true);
    await expect(service.setStatus(
      '10000000-0000-4000-8000-000000000001',
      false,
      'user-id',
      { requestId: 'request-1', ipAddress: null, userAgent: null },
    )).rejects.toBeInstanceOf(ConflictException);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('salva a preferencia de exibição e a inclui na auditoria', async () => {
    repository.existsByCode.mockResolvedValue(false);
    repository.save.mockImplementation((location: StockLocationEntity) => Promise.resolve(location));
    const location = await service.create({
      code: 'EST_TESTE', name: 'Estoque teste', kind: StockLocationKind.Stock,
      displayMode: StockDisplayMode.Products,
    }, 'user-id', { requestId: 'request-1', ipAddress: null, userAgent: null });
    expect(location.displayMode).toBe(StockDisplayMode.Products);
    const calls = audit.record.mock.calls as unknown as Array<Array<unknown>>;
    const recorded = calls[0][0] as { newValues: { displayMode: StockDisplayMode } };
    expect(recorded.newValues.displayMode).toBe(StockDisplayMode.Products);
  });

  it('não permite exibição agregada em local externo', async () => {
    repository.existsByCode.mockResolvedValue(false);
    await expect(service.create({
      code: 'EX_TESTE', name: 'Externo', kind: StockLocationKind.External,
      displayMode: StockDisplayMode.Products,
    }, 'user-id', { requestId: 'request-1', ipAddress: null, userAgent: null }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(repository.save).not.toHaveBeenCalled();
  });
});
