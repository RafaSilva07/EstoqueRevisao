import { BadRequestException, ConflictException, ExecutionContext } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { DataSource, EntityManager } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { AdminGuard } from '../users/admin.guard';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { recentDuplicateMinutes } from './recent-duplicate-window';

describe('intervalo configurável do aviso de duplicidade', () => {
  const findOneBy = jest.fn(); const save = jest.fn(); const query = jest.fn();
  const manager = { findOneBy, save, query } as unknown as EntityManager;
  const transaction = jest.fn((work: (value: EntityManager) => unknown) => work(manager));
  const record = jest.fn();
  const service = new SettingsService({ manager, transaction } as unknown as DataSource, { record } as unknown as AuditService);
  const metadata = { requestId: 'request', ipAddress: null, userAgent: 'jest' };
  beforeEach(() => { jest.restoreAllMocks(); jest.clearAllMocks(); findOneBy.mockResolvedValue(null); save.mockResolvedValue({}); query.mockResolvedValue([]); record.mockResolvedValue(undefined); });

  it('mantém 30 minutos enquanto a configuração ainda não foi salva', async () => {
    await expect(recentDuplicateMinutes(manager)).resolves.toBe(30);
  });
  it.each(['0', '-1', '1.5', '1441', 'abc'])('não ignora configuração inválida persistida: %s', async (value) => {
    findOneBy.mockResolvedValue({ value });
    await expect(recentDuplicateMinutes(manager)).rejects.toBeInstanceOf(ConflictException);
  });
  it('salva responsável e antes/depois com a auditoria na mesma transação', async () => {
    findOneBy.mockResolvedValue({ value: '30' });
    const configuration = { immediateSeparationMinutes: 180, recentDuplicateMinutes: 90, reviewDestinations: [], shipmentPhotos: { minimum: 1, maximum: 5 } };
    jest.spyOn(service, 'getOperational').mockResolvedValue(configuration);
    await expect(service.updateDuplicateWindow(90, 'admin', metadata)).resolves.toEqual(configuration);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('pg_advisory_xact_lock'), ['settings:recent_duplicate_minutes']);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ key: 'recent_duplicate_minutes', value: '90', updatedById: 'admin' }));
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ ...metadata, manager, userId: 'admin', action: 'SETTINGS_DUPLICATE_WINDOW_UPDATE', oldValues: { minutes: 30 }, newValues: { minutes: 90 } }));
  });
  it.each([0, -1, 1.5, 1441, Number.NaN])('recusa %s antes de iniciar a transação', async (minutes) => {
    await expect(service.updateDuplicateWindow(minutes, 'admin', metadata)).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled(); expect(record).not.toHaveBeenCalled();
  });
  it('propaga falha de auditoria para impedir o commit da configuração', async () => {
    record.mockRejectedValueOnce(new Error('audit failed'));
    await expect(service.updateDuplicateWindow(90, 'admin', metadata)).rejects.toThrow('audit failed');
  });
  it('protege a rota de atualização com o guard do administrador geral', () => {
    const handler = Object.getOwnPropertyDescriptor(SettingsController.prototype, 'duplicateWindow')!.value as object;
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(AdminGuard);
  });
  it.each([
    [['ADMIN'], 'ADMIN', true], [['ADMIN'], undefined, true], [['ADMIN'], 'PCP', false],
    [['ADMIN_REVISAO_EXPEDICAO'], 'REVISAO', false], [['ADMIN_PRODUCAO_PCP'], 'PCP', false], [['PCP'], 'PCP', false],
  ])('valida perfil %s no modo %s', (roles, mode, allowed) => {
    const request = { user: { roles }, headers: { 'x-operational-sector': mode } };
    const context = { switchToHttp: (): { getRequest: () => typeof request } => ({ getRequest: (): typeof request => request }) } as unknown as ExecutionContext;
    expect(new AdminGuard().canActivate(context)).toBe(allowed);
  });
});
