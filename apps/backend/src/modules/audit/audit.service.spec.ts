import { AuditService } from './audit.service';
import { AuditRepository } from './audit.repository';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { AuditRecordInput } from './audit.types';

describe('AuditService', () => {
  let service: AuditService;
  let auditRepository: jest.Mocked<AuditRepository>;
  let systemLogsService: jest.Mocked<SystemLogsService>;

  const defaultMeta = {
    requestId: 'req-test-123',
    ipAddress: '127.0.0.1',
    userAgent: 'jest-test-runner',
  };

  beforeEach(() => {
    auditRepository = {
      save: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditRepository>;

    systemLogsService = {
      createLog: jest.fn().mockResolvedValue({} as any),
    } as unknown as jest.Mocked<SystemLogsService>;

    service = new AuditService(auditRepository, systemLogsService);
  });

  it('deve persistir log de auditoria e registrar log de sistema INFO para recebimento com separacao imediata', async () => {
    const input: AuditRecordInput = {
      ...defaultMeta,
      userId: 'usr-1',
      action: 'SHIPMENT_SEPARATION_START',
      entityType: 'SHIPMENT',
      entityId: 'shp-1',
      result: 'SUCCESS',
      newValues: {
        codigoMovimentacao: 'REM-20261106-001',
        originSector: 'EXPEDICAO',
        destinationSector: 'REVISAO',
        status: 'EM_SEPARACAO',
      },
    };

    await service.record(input);

    expect(auditRepository.save).toHaveBeenCalledTimes(1);
    expect(systemLogsService.createLog).toHaveBeenCalledTimes(1);
    expect(systemLogsService.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'INFO',
        context: 'ShipmentsService',
        eventId: 'REM-20261106-001',
        description: 'Recebimento confirmado com separação imediata iniciada [REM-20261106-001].',
        details: expect.objectContaining({
          action: 'SHIPMENT_SEPARATION_START',
          userId: 'usr-1',
          result: 'SUCCESS',
        }),
      }),
    );
  });

  it('deve registrar log de sistema para rascunho de separacao salvo', async () => {
    const input: AuditRecordInput = {
      ...defaultMeta,
      userId: 'usr-2',
      action: 'SHIPMENT_SEPARATION_DRAFT_SAVE',
      entityType: 'SHIPMENT',
      entityId: 'shp-2',
      result: 'SUCCESS',
      newValues: {
        codigoMovimentacao: 'REM-20261106-002',
        items: [{ shipmentItemId: 'item-1', returnQuantity: 2 }],
      },
    };

    await service.record(input);

    expect(systemLogsService.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'INFO',
        context: 'ShipmentsService',
        eventId: 'REM-20261106-002',
        description: 'Rascunho de separação salvo com sucesso [REM-20261106-002].',
      }),
    );
  });

  it('deve registrar log de sistema para conclusao de separacao', async () => {
    const input: AuditRecordInput = {
      ...defaultMeta,
      userId: 'usr-3',
      action: 'SHIPMENT_SEPARATION_COMPLETE',
      entityType: 'SHIPMENT',
      entityId: 'shp-3',
      result: 'SUCCESS',
      newValues: {
        codigoMovimentacao: 'REM-20261106-003',
        status: 'CONFIRMADO',
      },
    };

    await service.record(input);

    expect(systemLogsService.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'INFO',
        context: 'ShipmentsService',
        eventId: 'REM-20261106-003',
        description: 'Separação de remessa concluída com sucesso e saldo consolidado [REM-20261106-003].',
      }),
    );
  });

  it('deve registrar log WARN quando a acao falha', async () => {
    const input: AuditRecordInput = {
      ...defaultMeta,
      userId: null,
      action: 'AUTH_LOGIN_FAILED',
      entityType: 'AUTH_SESSION',
      result: 'FAILURE',
      newValues: { username: 'desconhecido' },
    };

    await service.record(input);

    expect(systemLogsService.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'WARN',
        context: 'AuthService',
        description: 'Tentativa de autenticação de usuário falhou.',
      }),
    );
  });

  it('deve funcionar normalmente sem falhar caso SystemLogsService seja omitido', async () => {
    const fallbackService = new AuditService(auditRepository, undefined);
    const input: AuditRecordInput = {
      ...defaultMeta,
      userId: 'usr-4',
      action: 'SHIPMENT_CONFIRM',
      entityType: 'SHIPMENT',
      entityId: 'shp-4',
      result: 'SUCCESS',
      newValues: { codigoMovimentacao: 'REM-20261106-004' },
    };

    await expect(fallbackService.record(input)).resolves.not.toThrow();
    expect(auditRepository.save).toHaveBeenCalledTimes(1);
  });
});
