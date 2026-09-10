import { OperationalLotsService } from '../batches/operational-lots.service';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { StockLocationKind } from '../stocks/domain/stock-location-kind.enum';
import { ReviewLocationRole } from '../stocks/domain/review-location-role.enum';
import { StockLocationEntity } from '../stocks/entities/stock-location.entity';
import { StockLocationsRepository } from '../stocks/stock-locations.repository';
import { StockPositionsService } from '../stocks/stock-positions.service';
import { MovementStatus } from './domain/movement-status.enum';
import { MovementType } from './domain/movement-type.enum';
import { MovementEntity } from './entities/movement.entity';
import { MovementsRepository } from './movements.repository';
import { MovementsService } from './movements.service';

describe('MovementsService', () => {
  const findBatch = jest.fn(({ id }: { id: string }) => Promise.resolve({ id, code: id }));
  const lockQuery = { where: jest.fn().mockReturnThis(), setLock: jest.fn().mockReturnThis(), getOne: jest.fn() };
  const manager = { getRepository: () => ({ findOneBy: findBatch, createQueryBuilder: (): typeof lockQuery => lockQuery }) } as unknown as EntityManager;
  const lots = { resolveExistingInTransaction: jest.fn() };
  const originId = '10000000-0000-4000-8000-000000000006';
  const destinationId = '10000000-0000-4000-8000-000000000002';
  const userId = '40000000-0000-4000-8000-000000000001';
  const dto = {
    requestKey: '50000000-0000-4000-8000-000000000001', originLocationId: originId,
    destinationLocationId: destinationId, observation: 'Recebimento direto',
    items: [
      { productId: '60000000-0000-4000-8000-000000000001', batchId: '70000000-0000-4000-8000-000000000001', quantity: 10 },
      { productId: '60000000-0000-4000-8000-000000000002', batchId: '70000000-0000-4000-8000-000000000002', quantity: 3 },
    ],
  };
  const repository = { findByRequestKey: jest.fn(), findById: jest.fn(), findByIdForUpdate: jest.fn(), findAndCount: jest.fn(), save: jest.fn(), saveItems: jest.fn(), saveDistributions: jest.fn() };
  const locations = { findById: jest.fn(), findByReviewRole: jest.fn() };
  const stock = { addQuantity: jest.fn(), removeQuantity: jest.fn(), transferQuantity: jest.fn(), distributeQuantity: jest.fn(), restoreDistributedQuantity: jest.fn() };
  const audit = { record: jest.fn() };
  const dataSource = { transaction: jest.fn((operation: (value: EntityManager) => unknown) => operation(manager)) };
  const service = new MovementsService(repository as unknown as MovementsRepository, locations as unknown as StockLocationsRepository, stock as unknown as StockPositionsService, audit as unknown as AuditService, dataSource as unknown as DataSource, lots as unknown as OperationalLotsService);

  beforeEach(() => {
    jest.clearAllMocks();
    repository.findByRequestKey.mockResolvedValue(null);
    repository.save.mockImplementation((value: unknown) => Promise.resolve(value));
    repository.saveItems.mockImplementation((value: unknown) => Promise.resolve(value));
    repository.saveDistributions.mockImplementation((value: unknown) => Promise.resolve(value));
    repository.findById.mockImplementation((id: string) => Promise.resolve(Object.assign(new MovementEntity(), { id, items: [] })));
    locations.findById.mockImplementation((id: string) => Promise.resolve(Object.assign(new StockLocationEntity(), { id, active: true, kind: id === originId ? StockLocationKind.External : StockLocationKind.Substock })));
    stock.addQuantity.mockResolvedValue({});
    stock.removeQuantity.mockResolvedValue({});
    stock.transferQuantity.mockResolvedValue({});
    stock.distributeQuantity.mockResolvedValue(undefined);
    stock.restoreDistributedQuantity.mockResolvedValue(undefined);
  });

  describe('cancelamento', () => {
    const metadata = { requestId: dto.requestKey, ipAddress: null, userAgent: null };
    const movement = (type: MovementType): MovementEntity => Object.assign(new MovementEntity(), {
      id: dto.requestKey,
      type,
      status: MovementStatus.Effective,
      originLocationId: originId,
      destinationLocationId: type === MovementType.Review ? null : destinationId,
      items: [Object.assign({
        productId: dto.items[0].productId,
        batchId: dto.items[0].batchId,
        destinationBatchId: '70000000-0000-4000-8000-000000000099',
        quantity: 10,
        distributions: [
          { destinationLocationId: '10000000-0000-4000-8000-000000000004', quantity: 6 },
          { destinationLocationId: '10000000-0000-4000-8000-000000000005', quantity: 4 },
        ],
      })],
    });

    beforeEach(() => {
      repository.findByIdForUpdate.mockResolvedValue(movement(MovementType.ExternalEntry));
    });

    it.each([
      [MovementType.ExternalEntry, 'removeQuantity'],
      [MovementType.ExternalExit, 'addQuantity'],
      [MovementType.InternalTransfer, 'transferQuantity'],
      [MovementType.Review, 'restoreDistributedQuantity'],
    ] as const)('estorna integralmente %s pelo servico central de saldo', async (type, method) => {
      repository.findByIdForUpdate.mockResolvedValue(movement(type));
      await service.cancel(dto.requestKey, { reason: 'Lancamento incorreto' }, userId, metadata);
      expect(stock[method]).toHaveBeenCalledTimes(1);
      expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({
        status: MovementStatus.Canceled,
        canceledByUserId: userId,
        cancellationReason: 'Lancamento incorreto',
      }), manager);
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
        action: 'MOVEMENT_CANCEL', manager, userId,
      }));
    });

    it('bloqueia novo cancelamento sem tocar no estoque', async () => {
      repository.findByIdForUpdate.mockResolvedValue(Object.assign(
        movement(MovementType.ExternalEntry),
        { status: MovementStatus.Canceled },
      ));
      await expect(service.cancel(dto.requestKey, { reason: 'Repetido' }, userId, metadata))
        .rejects.toMatchObject({ response: { code: 'MOVEMENT_ALREADY_CANCELED' } });
      expect(stock.removeQuantity).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('nao altera status nem audita quando o saldo necessario foi consumido', async () => {
      const effective = movement(MovementType.ExternalEntry);
      repository.findByIdForUpdate.mockResolvedValue(effective);
      stock.removeQuantity.mockRejectedValueOnce(new ConflictException({
        code: 'INSUFFICIENT_STOCK', message: 'Saldo insuficiente.',
      }));
      await expect(service.cancel(dto.requestKey, { reason: 'Lancamento incorreto' }, userId, metadata))
        .rejects.toBeInstanceOf(ConflictException);
      expect(effective.status).toBe(MovementStatus.Effective);
      expect(repository.save).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  it('registra cabecalho e varios itens em uma unica transacao', async () => {
    const result = await service.createExternalEntry(dto, userId, { requestId: dto.requestKey, ipAddress: null, userAgent: null });
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(repository.saveItems).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ quantity: 10 }), expect.objectContaining({ quantity: 3 })]), manager);
    expect(result.id).toBeDefined();
  });

  it('soma cada item ao destino somente pelo servico central de saldo', async () => {
    await service.createExternalEntry(dto, userId, { requestId: dto.requestKey, ipAddress: null, userAgent: null });
    expect(stock.addQuantity).toHaveBeenNthCalledWith(1, { productId: dto.items[0].productId, batchId: dto.items[0].batchId, stockLocationId: destinationId }, 10, manager);
    expect(stock.addQuantity).toHaveBeenNthCalledWith(2, { productId: dto.items[1].productId, batchId: dto.items[1].batchId, stockLocationId: destinationId }, 3, manager);
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
      }, 3, manager);
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
          message: 'O mesmo produto e lote nao pode aparecer duas vezes na mesma movimentacao.',
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

  describe('transferencia interna', () => {
    const transferDestinationId = '10000000-0000-4000-8000-000000000003';
    const transferDto = {
      ...dto,
      requestKey: '50000000-0000-4000-8000-000000000003',
      originLocationId: destinationId,
      destinationLocationId: transferDestinationId,
      items: dto.items.map((item) => ({ ...item, destinationBatchId: item.batchId })),
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

    it('transfere todos os itens entre os mesmos locais internos', async () => {
      await service.createInternalTransfer(transferDto, userId, {
        requestId: transferDto.requestKey, ipAddress: null, userAgent: null,
      });
      expect(stock.transferQuantity).toHaveBeenNthCalledWith(1, {
        productId: transferDto.items[0].productId,
        batchId: transferDto.items[0].batchId,
        stockLocationId: destinationId,
      }, {
        productId: transferDto.items[0].productId,
        batchId: transferDto.items[0].batchId,
        stockLocationId: transferDestinationId,
      }, transferDto.items[0].quantity, manager);
      expect(stock.transferQuantity).toHaveBeenCalledTimes(2);
      expect(stock.addQuantity).not.toHaveBeenCalled();
      expect(stock.removeQuantity).not.toHaveBeenCalled();
    });

    it('grava tipo, responsavel e auditoria da transferencia', async () => {
      await service.createInternalTransfer(transferDto, userId, {
        requestId: transferDto.requestKey, ipAddress: null, userAgent: null,
      });
      expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({
        type: MovementType.InternalTransfer,
        responsibleUserId: userId,
      }), manager);
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
        manager,
        userId,
        action: 'INTERNAL_TRANSFER_CREATE',
      }));
    });

    it('rejeita mesmo local e mesmo lote antes da transacao', async () => {
      await expect(service.createInternalTransfer({
        ...transferDto,
        destinationLocationId: transferDto.originLocationId,
      }, userId, {
        requestId: transferDto.requestKey, ipAddress: null, userAgent: null,
      })).rejects.toMatchObject({
        response: {
          code: 'TRANSFER_WITHOUT_CHANGE',
          message: 'A transferencia deve alterar o lote ou o local.',
        },
      });
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('rejeita origem externa', async () => {
      await expect(service.createInternalTransfer({
        ...transferDto,
        originLocationId: originId,
      }, userId, {
        requestId: transferDto.requestKey, ipAddress: null, userAgent: null,
      })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejeita destino externo', async () => {
      await expect(service.createInternalTransfer({
        ...transferDto,
        destinationLocationId: originId,
      }, userId, {
        requestId: transferDto.requestKey, ipAddress: null, userAgent: null,
      })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejeita itens duplicados', async () => {
      await expect(service.createInternalTransfer({
        ...transferDto,
        items: [transferDto.items[0], transferDto.items[0]],
      }, userId, {
        requestId: transferDto.requestKey, ipAddress: null, userAgent: null,
      })).rejects.toBeInstanceOf(BadRequestException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('interrompe itens e auditoria quando uma baixa falha', async () => {
      stock.transferQuantity.mockRejectedValueOnce(new ConflictException({
        code: 'INSUFFICIENT_STOCK', message: 'Saldo insuficiente. Disponivel: 1.',
      }));
      await expect(service.createInternalTransfer(transferDto, userId, {
        requestId: transferDto.requestKey, ipAddress: null, userAgent: null,
      })).rejects.toBeInstanceOf(ConflictException);
      expect(repository.saveItems).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('protege o reenvio idempotente da mesma transferencia', async () => {
      const existing = Object.assign(new MovementEntity(), {
        requestKey: transferDto.requestKey,
        responsibleUserId: userId,
        type: MovementType.InternalTransfer,
      });
      repository.findByRequestKey.mockResolvedValue(existing);
      await expect(service.createInternalTransfer(transferDto, userId, {
        requestId: transferDto.requestKey, ipAddress: null, userAgent: null,
      })).resolves.toBe(existing);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('transfere para outro lote do mesmo produto em outro local', async () => {
      const destinationBatchId = '70000000-0000-4000-8000-000000000099';
      await service.createInternalTransfer({
        ...transferDto,
        items: [{ ...transferDto.items[0], destinationBatchId }],
      }, userId, {
        requestId: transferDto.requestKey, ipAddress: null, userAgent: null,
      });
      expect(stock.transferQuantity).toHaveBeenCalledWith({
        productId: transferDto.items[0].productId,
        batchId: transferDto.items[0].batchId,
        stockLocationId: transferDto.originLocationId,
      }, {
        productId: transferDto.items[0].productId,
        batchId: destinationBatchId,
        stockLocationId: transferDestinationId,
      }, transferDto.items[0].quantity, manager);
      expect(repository.saveItems).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ destinationBatchId }),
      ]), manager);
    });

    it('permite trocar o lote no mesmo local', async () => {
      const destinationBatchId = '70000000-0000-4000-8000-000000000099';
      await expect(service.createInternalTransfer({
        ...transferDto,
        destinationLocationId: transferDto.originLocationId,
        items: [{ ...transferDto.items[0], destinationBatchId }],
      }, userId, {
        requestId: transferDto.requestKey, ipAddress: null, userAgent: null,
      })).resolves.toBeDefined();
    });

    it('rejeita mesmo local e mesmo lote ou lote de destino ausente', async () => {
      await expect(service.createInternalTransfer({
        ...transferDto,
        destinationLocationId: transferDto.originLocationId,
      }, userId, {
        requestId: transferDto.requestKey, ipAddress: null, userAgent: null,
      })).rejects.toMatchObject({ response: { code: 'TRANSFER_WITHOUT_CHANGE' } });
      await expect(service.createInternalTransfer({
        ...transferDto,
        items: [{
          ...transferDto.items[0],
          destinationBatchId: undefined,
        }],
      }, userId, {
        requestId: transferDto.requestKey, ipAddress: null, userAgent: null,
      })).rejects.toMatchObject({
        response: { code: 'TRANSFER_DESTINATION_BATCH_REQUIRED' },
      });
    });

    it('propaga rejeicao de lote de destino incompatível antes de salvar itens', async () => {
      stock.transferQuantity.mockRejectedValueOnce(new BadRequestException({
        code: 'INVALID_STOCK_PRODUCT_BATCH',
        message: 'O produto e o lote informados nao possuem uma associacao valida.',
      }));
      await expect(service.createInternalTransfer(transferDto, userId, {
        requestId: transferDto.requestKey, ipAddress: null, userAgent: null,
      })).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.saveItems).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('revisao', () => {
    const reviewSourceId = '10000000-0000-4000-8000-000000000002';
    const lataBoaId = '10000000-0000-4000-8000-000000000003';
    const varejoId = '10000000-0000-4000-8000-000000000004';
    const tufId = '10000000-0000-4000-8000-000000000005';
    const reviewDto = {
      requestKey: '50000000-0000-4000-8000-000000000004',
      observation: 'Classificacao do turno',
      items: [
        {
          productId: dto.items[0].productId,
          batchId: dto.items[0].batchId,
          quantity: 10,
          distributions: [
            { destinationLocationId: lataBoaId, quantity: 7 },
            { destinationLocationId: varejoId, quantity: 2 },
            { destinationLocationId: tufId, quantity: 1 },
          ],
        },
        {
          productId: dto.items[1].productId,
          batchId: dto.items[1].batchId,
          quantity: 3,
          distributions: [{ destinationLocationId: lataBoaId, quantity: 3 }],
        },
      ],
    };

    beforeEach(() => {
      locations.findByReviewRole.mockImplementation((role: ReviewLocationRole) => Promise.resolve(
        role === ReviewLocationRole.Source
          ? [Object.assign(new StockLocationEntity(), { id: reviewSourceId, active: true, reviewRole: role })]
          : [lataBoaId, varejoId, tufId].map((id) => Object.assign(
            new StockLocationEntity(),
            { id, active: true, reviewRole: role },
          )),
      ));
    });

    it('registra uma revisao com varios itens e destinos', async () => {
      await service.createReview(reviewDto, userId, {
        requestId: reviewDto.requestKey, ipAddress: null, userAgent: null,
      });
      expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({
        type: MovementType.Review,
        originLocationId: reviewSourceId,
        destinationLocationId: null,
        responsibleUserId: userId,
      }), manager);
      expect(stock.distributeQuantity).toHaveBeenCalledTimes(2);
      expect(repository.saveItems).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ quantity: 10 }),
        expect.objectContaining({ quantity: 3 }),
      ]), manager);
      expect(repository.saveDistributions).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ destinationLocationId: lataBoaId, quantity: 7 }),
        expect.objectContaining({ destinationLocationId: varejoId, quantity: 2 }),
        expect.objectContaining({ destinationLocationId: tufId, quantity: 1 }),
      ]), manager);
    });

    it('aceita distribuicao exata para um, dois ou tres destinos', async () => {
      for (const distributions of [
        [{ destinationLocationId: lataBoaId, quantity: 10 }],
        [{ destinationLocationId: lataBoaId, quantity: 8 }, { destinationLocationId: tufId, quantity: 2 }],
        reviewDto.items[0].distributions,
      ]) {
        await expect(service.createReview({
          ...reviewDto,
          requestKey: crypto.randomUUID(),
          items: [{ ...reviewDto.items[0], distributions }],
        }, userId, {
          requestId: reviewDto.requestKey, ipAddress: null, userAgent: null,
        })).resolves.toBeDefined();
      }
    });

    it.each([
      ['menor', 9],
      ['maior', 11],
    ])('rejeita distribuicao %s que a quantidade revisada', async (_label, distributed) => {
      await expect(service.createReview({
        ...reviewDto,
        items: [{
          ...reviewDto.items[0],
          distributions: [{ destinationLocationId: lataBoaId, quantity: distributed }],
        }],
      }, userId, {
        requestId: reviewDto.requestKey, ipAddress: null, userAgent: null,
      })).rejects.toMatchObject({ response: { code: 'INVALID_REVIEW_DISTRIBUTION_TOTAL' } });
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('rejeita o mesmo produto e lote duas vezes', async () => {
      await expect(service.createReview({
        ...reviewDto,
        items: [reviewDto.items[0], reviewDto.items[0]],
      }, userId, {
        requestId: reviewDto.requestKey, ipAddress: null, userAgent: null,
      })).rejects.toMatchObject({ response: { code: 'DUPLICATE_REVIEW_ITEM' } });
    });

    it('rejeita destino duplicado no mesmo item', async () => {
      await expect(service.createReview({
        ...reviewDto,
        items: [{
          ...reviewDto.items[0],
          distributions: [
            { destinationLocationId: lataBoaId, quantity: 5 },
            { destinationLocationId: lataBoaId, quantity: 5 },
          ],
        }],
      }, userId, {
        requestId: reviewDto.requestKey, ipAddress: null, userAgent: null,
      })).rejects.toMatchObject({ response: { code: 'DUPLICATE_REVIEW_DESTINATION' } });
    });

    it('rejeita Revisar, local externo ou qualquer destino nao configurado', async () => {
      for (const invalidId of [reviewSourceId, originId]) {
        await expect(service.createReview({
          ...reviewDto,
          items: [{
            ...reviewDto.items[0],
            distributions: [{ destinationLocationId: invalidId, quantity: 10 }],
          }],
        }, userId, {
          requestId: reviewDto.requestKey, ipAddress: null, userAgent: null,
        })).rejects.toMatchObject({ response: { code: 'INVALID_REVIEW_DESTINATION' } });
      }
    });

    it('interrompe itens, distribuicoes e auditoria quando qualquer item falha', async () => {
      stock.distributeQuantity.mockResolvedValueOnce(undefined).mockRejectedValueOnce(
        new ConflictException({ code: 'INSUFFICIENT_STOCK', message: 'Saldo insuficiente.' }),
      );
      await expect(service.createReview(reviewDto, userId, {
        requestId: reviewDto.requestKey, ipAddress: null, userAgent: null,
      })).rejects.toBeInstanceOf(ConflictException);
      expect(repository.saveItems).not.toHaveBeenCalled();
      expect(repository.saveDistributions).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('registra auditoria e protege o reenvio da revisao', async () => {
      await service.createReview(reviewDto, userId, {
        requestId: reviewDto.requestKey, ipAddress: null, userAgent: null,
      });
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
        manager,
        userId,
        action: 'REVIEW_CREATE',
        entityType: 'MOVEMENT',
      }));

      const existing = Object.assign(new MovementEntity(), {
        requestKey: reviewDto.requestKey,
        responsibleUserId: userId,
        type: MovementType.Review,
      });
      jest.clearAllMocks();
      repository.findByRequestKey.mockResolvedValue(existing);
      await expect(service.createReview(reviewDto, userId, {
        requestId: reviewDto.requestKey, ipAddress: null, userAgent: null,
      })).resolves.toBe(existing);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });
});
