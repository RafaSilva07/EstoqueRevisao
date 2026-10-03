import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuthenticatedUser } from '../auth/authenticated-user.interface';
import { HistoryQueryDto } from './history-query.dto';
import { HistoryService } from './history.service';

describe('Exportação do histórico', () => {
  const db = { query: jest.fn().mockResolvedValue([]) };
  const service = new HistoryService(db as unknown as DataSource);
  const user = { sector: 'REVISAO', permissions: ['movements.read', 'shipments.read'] } as AuthenticatedUser;
  beforeEach(() => db.query.mockClear());

  it('reutiliza filtros e setor, força registro finalizado e ignora paginação', async () => {
    const query = Object.assign(new HistoryQueryDto(), { view: 'GROUP', page: 4, limit: 1, sort: 'OLDEST', search: '005601.90',
      direction: 'INCOMING', kind: 'MOVEMENT', type: 'ENTRADA_EXTERNA', dateFrom: '2026-10-01T00:00:00Z', dateTo: '2026-10-02T00:00:00Z' });
    await service.exportCsv(query, user);
    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, parameters] = db.query.mock.calls[0] as [string, unknown[]];
    expect(parameters).toEqual([true, 'REVISAO', true, 'DONE', 'MOVEMENT', '005601.90', 'ENTRADA_EXTERNA',
      query.dateFrom, query.dateTo, 'INCOMING']);
    expect(sql).toContain('FROM records source');
    expect(sql).toContain("WHERE NOT pcp_required OR pcp_execution_status = 'EXECUTADA'");
    expect(sql).toContain('ORDER BY occurred_at ASC');
    expect(sql).not.toMatch(/LIMIT|OFFSET/);
    expect(query.view).toBe('GROUP');
  });

  it.each(['OPEN', 'PENDING_PCP', 'CLOSED'])('não ignora o filtro incompatível %s', async (scope) => {
    await expect(service.exportCsv(Object.assign(new HistoryQueryDto(), { scope }), user)).rejects.toThrow(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('recusa período invertido e acesso sem permissão', async () => {
    await expect(service.exportCsv(Object.assign(new HistoryQueryDto(), { dateFrom: '2026-10-02', dateTo: '2026-10-01' }), user)).rejects.toThrow(BadRequestException);
    await expect(service.exportCsv(new HistoryQueryDto(), { ...user, permissions: [] })).rejects.toThrow(ForbiddenException);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('mantém Produção restrita a seus envios e PCP com leitura global de movimentações', async () => {
    await service.exportCsv(new HistoryQueryDto(), { ...user, sector: 'PRODUCAO', permissions: ['shipments.read'] });
    expect((db.query.mock.calls[0] as [string, unknown[]])[1].slice(0, 3)).toEqual([true, 'PRODUCAO', false]);
    await service.exportCsv(new HistoryQueryDto(), { ...user, sector: 'PCP', permissions: ['pcp.movements.read'] });
    expect((db.query.mock.calls[1] as [string, unknown[]])[1].slice(0, 3)).toEqual([false, 'PCP', true]);
  });
});
