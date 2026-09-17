import { ConflictException } from '@nestjs/common';
import { MovementStatus } from '../movements/domain/movement-status.enum';
import { MovementEntity } from '../movements/entities/movement.entity';
import { PcpExecutionStatus } from './domain/pcp-execution-status.enum';
import { PcpMovementsService } from './pcp-movements.service';

describe('PcpMovementsService', () => {
  const manager = {};
  const metadata = { requestId: '11111111-1111-4111-8111-111111111111', ipAddress: null, userAgent: null };
  const movement = (status = MovementStatus.Effective, pcpExecutionStatus = PcpExecutionStatus.Pending): MovementEntity => ({
    id: '22222222-2222-4222-8222-222222222222', status, pcpExecutionStatus,
    shipmentId: null, items: [], responsibleUser: {}, originLocation: {}, destinationLocation: null,
  }) as unknown as MovementEntity;

  function setup(current = movement()): { service: PcpMovementsService; movements: { save: ReturnType<typeof jest.fn> }; audit: { record: ReturnType<typeof jest.fn> } } {
    const pcpRepository = { findAndCount: jest.fn(), findAuditHistory: jest.fn().mockResolvedValue([]), findShipmentEvidence: jest.fn(), findShipment: jest.fn() };
    const movements = { findByIdForUpdate: jest.fn().mockResolvedValue(current), save: jest.fn().mockResolvedValue(current), findById: jest.fn().mockResolvedValue(current) };
    const dataSource = { transaction: jest.fn((callback: (value: unknown) => unknown) => Promise.resolve(callback(manager))) };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    return { service: new PcpMovementsService(pcpRepository as never, movements as never, dataSource as never, audit as never), movements, audit };
  }

  it('executa uma movimentacao concluida e audita usuario, horario e observacao', async () => {
    const current = movement();
    const { service, movements, audit } = setup(current);
    await service.execute(current.id, { observation: 'Lancada no corporativo.' }, '33333333-3333-4333-8333-333333333333', metadata);
    expect(current.pcpExecutionStatus).toBe(PcpExecutionStatus.Executed);
    expect(current.pcpExecutedByUserId).toBe('33333333-3333-4333-8333-333333333333');
    expect(current.pcpExecutedAt).toBeInstanceOf(Date);
    expect(current.pcpExecutionObservation).toBe('Lancada no corporativo.');
    expect(movements.save).toHaveBeenCalledWith(current, manager);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'PCP_MOVEMENT_EXECUTE', entityType: 'MOVEMENT', manager }));
  });

  it('aceita observacao vazia e a persiste como nula', async () => {
    const current = movement();
    const { service } = setup(current);
    await service.execute(current.id, {}, '33333333-3333-4333-8333-333333333333', metadata);
    expect(current.pcpExecutionObservation).toBeNull();
  });

  it.each([
    [MovementStatus.Canceled, PcpExecutionStatus.Pending, 'PCP_MOVEMENT_NOT_CONCLUDED'],
    [MovementStatus.Effective, PcpExecutionStatus.Executed, 'PCP_MOVEMENT_ALREADY_EXECUTED'],
  ])('rejeita transicao invalida %s/%s', async (status, pcpStatus, code) => {
    const { service } = setup(movement(status, pcpStatus));
    try {
      await service.execute('22222222-2222-4222-8222-222222222222', {}, '33333333-3333-4333-8333-333333333333', metadata);
      throw new Error('A execucao deveria falhar.');
    } catch (caught) {
      expect(caught).toBeInstanceOf(ConflictException);
      expect((caught as ConflictException).getResponse()).toMatchObject({ code });
    }
  });
});
