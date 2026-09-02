import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { StockLocationKind } from '../stocks/domain/stock-location-kind.enum';
import { StockLocationEntity } from '../stocks/entities/stock-location.entity';
import { StockLocationsRepository } from '../stocks/stock-locations.repository';
import { StockPositionsService } from '../stocks/stock-positions.service';
import { MovementStatus } from './domain/movement-status.enum';
import { MovementType } from './domain/movement-type.enum';
import { MovementEntity } from './entities/movement.entity';
import { MovementsRepository } from './movements.repository';
import { MovementsService } from './movements.service';

describe('MovementsService', () => {
  const manager = {} as EntityManager;
  const originId = '10000000-0000-4000-8000-000000000006';
  const destinationId = '10000000-0000-4000-8000-000000000002';
  const userId = '40000000-0000-4000-8000-000000000001';
  const dto = {
    requestKey: '50000000-0000-4000-8000-000000000001', originLocationId: originId,
    destinationLocationId: destinationId, observation: 'Recebimento direto',
    items: [
      { productId: '60000000-0000-4000-8000-000000000001', batchId: '70000000-0000-4000-8000-000000000001', quantity: 10 },
      { productId: '60000000-0000-4000-8000-000000000002', batchId: '70000000-0000-4000-8000-000000000002', quantity: 2.5 },
    ],
  };
  const repository = { findByRequestKey: jest.fn(), findById: jest.fn(), findAndCount: jest.fn(), save: jest.fn(), saveItems: jest.fn() };
  const locations = { findById: jest.fn() };
  const stock = { addQuantity: jest.fn(), removeQuantity: jest.fn() };
  const audit = { record: jest.fn() };
  const dataSource = { transaction: jest.fn((operation: (value: EntityManager) => unknown) => operation(manager)) };
  const service = new MovementsService(repository as unknown as MovementsRepository, locations as unknown as StockLocationsRepository, stock as unknown as StockPositionsService, audit as unknown as AuditService, dataSource as unknown as DataSource);

  beforeEach(() => {
    jest.clearAllMocks();
    repository.findByRequestKey.mockResolvedValue(null);
    repository.save.mockImplementation((value: unknown) => Promise.resolve(value));
    repository.saveItems.mockImplementation((value: unknown) => Promise.resolve(value));
    repository.findById.mockImplementation((id: string) => Promise.resolve(Object.assign(new MovementEntity(), { id, items: [] })));
    locations.findById.mockImplementation((id: string) => Promise.resolve(Object.assign(new StockLocationEntity(), { id, active: true, kind: id === originId ? StockLocationKind.External : StockLocationKind.Substock })));
    stock.addQuantity.mockResolvedValue({});
    stock.removeQuantity.mockResolvedValue({});
  });

  it('registra cabecalho e varios itens em uma unica transacao', async () => {
    const result = await service.createExternalEntry(dto, userId, { requestId: dto.requestKey, ipAddress: null, userAgent: null });
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(repository.saveItems).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ quantity: 10 }), expect.objectContaining({ quantity: 2.5 })]), manager);
    expect(result.id).toBeDefined();
  });

  it('soma cada item ao destino somente pelo servico central de saldo', async () => {
    await service.createExternalEntry(dto, userId, { requestId: dto.requestKey, ipAddress: null, userAgent: null });
    expect(stock.addQuantity).toHaveBeenNthCalledWith(1, { productId: dto.items[0].productId, batchId: dto.items[0].batchId, stockLocationId: destinationId }, 10, manager);
    expect(stock.addQuantity).toHaveBeenNthCalledWith(2, { productId: dto.items[1].productId, batchId: dto.items[1].batchId, stockLocationId: destinationId }, 2.5, manager);
  });

  it('nao tenta reduzir saldo da origem externa', async () => {
    await service.createExternalEntry(dto, userId, { requestId: dto.requestKey, ipAddress: null, userAgent: null });
    expect(stock.removeQuantity).not.toHaveBeenCalled();
  });

  it('rejeita origem que nao seja externa e ativa', async () => {
    locations.findById.mockResolvedValue(Object.assign(new StockLocationEntity(), { active: true, kind: StockLocationKind.Stock }));
    await expect(service.createExternalEntry(dto, userId, { requestId: dto.requestKey, ipAddress: null, userAgent: null })).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('rejeita destino externo ou inativo', async () => {
    locations.findById.mockImplementation((id: string) => Promise.resolve(Object.assign(new StockLocationEntity(), { active: id === originId, kind: id === originId ? StockLocationKind.External : StockLocationKind.Stock })));
    await expect(service.createExternalEntry(dto, userId, { requestId: dto.requestKey, ipAddress: null, userAgent: null })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('propaga falha de produto, lote ou quantidade e interrompe os itens seguintes', async () => {
    stock.addQuantity.mockRejectedValueOnce(new BadRequestException('item invalido'));
    await expect(service.createExternalEntry(dto, userId, { requestId: dto.requestKey, ipAddress: null, userAgent: null })).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.saveItems).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('registra auditoria no mesmo gerenciador transacional', async () => {
    await service.createExternalEntry(dto, userId, { requestId: dto.requestKey, ipAddress: null, userAgent: null });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ manager, userId, action: 'EXTERNAL_ENTRY_CREATE', entityType: 'MOVEMENT', result: 'SUCCESS' }));
  });

  it('define tipo, status, responsavel e horario efetivos', async () => {
    await service.createExternalEntry({ ...dto, occurredAt: '2026-09-01T12:30:00.000Z' }, userId, { requestId: dto.requestKey, ipAddress: null, userAgent: null });
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ type: MovementType.ExternalEntry, status: MovementStatus.Effective, responsibleUserId: userId, occurredAt: new Date('2026-09-01T12:30:00.000Z') }), manager);
  });

  it('protege reenvio duplicado retornando a movimentacao existente', async () => {
    const existing = Object.assign(new MovementEntity(), {
      requestKey: dto.requestKey,
      responsibleUserId: userId,
      type: MovementType.ExternalEntry,
    });
    repository.findByRequestKey.mockResolvedValue(existing);
    await expect(service.createExternalEntry(dto, userId, { requestId: dto.requestKey, ipAddress: null, userAgent: null })).resolves.toBe(existing);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('lista o historico com os filtros recebidos', async () => {
    const query = { page: 1, limit: 20, type: MovementType.ExternalEntry, productId: dto.items[0].productId };
    repository.findAndCount.mockResolvedValue([[new MovementEntity()], 1]);
    const result = await service.list(query);
    expect(repository.findAndCount).toHaveBeenCalledWith(query);
    expect(result.meta.total).toBe(1);
  });

  it('retorna o detalhe completo existente', async () => {
    const result = await service.getById('80000000-0000-4000-8000-000000000001');
    expect(result.id).toBe('80000000-0000-4000-8000-000000000001');
  });

  it('retorna nao encontrado sem oferecer edicao ou exclusao', async () => {
    repository.findById.mockResolvedValue(null);
    await expect(service.getById('80000000-0000-4000-8000-000000000099')).rejects.toBeInstanceOf(NotFoundException);
    expect(service).not.toHaveProperty('update');
    expect(service).not.toHaveProperty('remove');
  });

  describe('saida externa', () => {
    const exitDto = {
      ...dto,
      requestKey: '50000000-0000-4000-8000-000000000002',
      originLocationId: destinationId,
      destinationLocationId: originId,
    };

    beforeEach(() => {
      locations.findById.mockImplementation((id: string) => Promise.resolve(
        Object.assign(new StockLocationEntity(), {
          id,
          active: true,
          kind: id === originId ? StockLocationKind.External : StockLocationKind.Substock,
        }),
      ));
    });

    it('reduz todos os itens somente na origem controlada', async () => {
      await service.createExternalExit(exitDto, userId, {
        requestId: exitDto.requestKey, ipAddress: null, userAgent: null,
      });
      expect(stock.removeQuantity).toHaveBeenNthCalledWith(1, {
        productId: exitDto.items[0].productId,
        batchId: exitDto.items[0].batchId,
        stockLocationId: destinationId,
      }, 10, manager);
      expect(stock.removeQuantity).toHaveBeenNthCalledWith(2, {
        productId: exitDto.items[1].productId,
        batchId: exitDto.items[1].batchId,
        stockLocationId: destinationId,
      }, 2.5, manager);
      expect(stock.addQuantity).not.toHaveBeenCalled();
    });

    it('grava tipo, responsavel e auditoria de saida', async () => {
      await service.createExternalExit(exitDto, userId, {
        requestId: exitDto.requestKey, ipAddress: null, userAgent: null,
      });
      expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({
        type: MovementType.ExternalExit,
        responsibleUserId: userId,
      }), manager);
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
        manager,
        userId,
        action: 'EXTERNAL_EXIT_CREATE',
      }));
    });

    it('rejeita origem externa', async () => {
      locations.findById.mockResolvedValue(Object.assign(new StockLocationEntity(), {
        active: true,
        kind: StockLocationKind.External,
      }));
      await expect(service.createExternalExit(exitDto, userId, {
        requestId: exitDto.requestKey, ipAddress: null, userAgent: null,
      })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejeita destino interno', async () => {
      locations.findById.mockResolvedValue(Object.assign(new StockLocationEntity(), {
        active: true,
        kind: StockLocationKind.Substock,
      }));
      await expect(service.createExternalExit(exitDto, userId, {
        requestId: exitDto.requestKey, ipAddress: null, userAgent: null,
      })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejeita produto e lote duplicados antes de abrir transacao', async () => {
      try {
        await service.createExternalExit({
          ...exitDto,
          items: [exitDto.items[0], { ...exitDto.items[0], quantity: 1 }],
        }, userId, {
          requestId: exitDto.requestKey, ipAddress: null, userAgent: null,
        });
        throw new Error('A saida deveria rejeitar itens duplicados.');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).getResponse()).toEqual({
          code: 'DUPLICATE_MOVEMENT_ITEM',
          message: 'O mesmo produto e lote nao pode aparecer duas vezes na mesma saida.',
        });
      }
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('propaga saldo insuficiente e nao grava itens nem auditoria', async () => {
      stock.removeQuantity.mockRejectedValueOnce(new ConflictException({
        code: 'INSUFFICIENT_STOCK', message: 'Saldo insuficiente. Disponivel: 5.',
      }));
      await expect(service.createExternalExit(exitDto, userId, {
        requestId: exitDto.requestKey, ipAddress: null, userAgent: null,
      })).rejects.toBeInstanceOf(ConflictException);
      expect(repository.saveItems).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('protege reenvio idempotente da mesma saida', async () => {
      const existing = Object.assign(new MovementEntity(), {
        requestKey: exitDto.requestKey,
        responsibleUserId: userId,
        type: MovementType.ExternalExit,
      });
      repository.findByRequestKey.mockResolvedValue(existing);
      await expect(service.createExternalExit(exitDto, userId, {
        requestId: exitDto.requestKey, ipAddress: null, userAgent: null,
      })).resolves.toBe(existing);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('nao aceita reutilizar chave de uma entrada para uma saida', async () => {
      repository.findByRequestKey.mockResolvedValue(Object.assign(new MovementEntity(), {
        requestKey: exitDto.requestKey,
        responsibleUserId: userId,
        type: MovementType.ExternalEntry,
      }));
      await expect(service.createExternalExit(exitDto, userId, {
        requestId: exitDto.requestKey, ipAddress: null, userAgent: null,
      })).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
