import { SystemLogsController } from './system-logs.controller';
import { SystemLogsService } from './system-logs.service';
import { SystemLogEntity } from './entities/system-log.entity';

describe('SystemLogsController', () => {
  let controller: SystemLogsController;
  let service: jest.Mocked<Partial<SystemLogsService>>;

  beforeEach(() => {
    service = {
      queryLogs: jest.fn().mockResolvedValue({
        items: [],
        meta: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 0,
        },
      }),
      getMetrics: jest.fn().mockResolvedValue({
        totalLogs: 10,
        countsByLevel: { INFO: 5, WARN: 3, ERROR: 2, FATAL: 0 },
        errorRatePercentage: 50,
        alert: {
          triggered: false,
          status: 'NORMAL',
          condition: 'Mais de 10 erros criticos em 5 minutos',
          threshold: 10,
          windowMinutes: 5,
          criticalErrorsInWindow: 2,
          message: 'Operação estável.',
        },
        topRecurringErrors: [],
        timeline: [],
        metricsPeriod: { start: '', end: '' },
      }),
      getCountByErrorCode: jest.fn().mockResolvedValue([
        { errorCode: 'PRODUCT_NOT_FOUND', count: 5, sampleDescription: 'Não encontrado', severity: 'WARN', lastOccurrence: new Date() },
      ]),
      getLogById: jest.fn().mockResolvedValue({
        id: '123e4567-e89b-12d3-a456-426614174000',
        level: 'WARN',
        description: 'Exemplo',
      } as SystemLogEntity),
    };

    controller = new SystemLogsController(service as SystemLogsService);
  });

  it('deve listar os logs delegando para o service', async () => {
    const res = await controller.list({ page: 1, limit: 10 });
    expect(service.queryLogs).toHaveBeenCalledWith({ page: 1, limit: 10 });
    expect(res.meta.total).toBe(0);
  });

  it('deve obter métricas delegando para o service', async () => {
    const res = await controller.metrics(5, 10);
    expect(service.getMetrics).toHaveBeenCalledWith(5, 10);
    expect(res.alert.status).toBe('NORMAL');
  });

  it('deve obter contagem por código de erro delegando para o service', async () => {
    const res = await controller.countByError();
    expect(service.getCountByErrorCode).toHaveBeenCalled();
    expect(res[0]?.errorCode).toBe('PRODUCT_NOT_FOUND');
  });

  it('deve obter log por id quando existente', async () => {
    const res = await controller.getById('123e4567-e89b-12d3-a456-426614174000');
    expect(res.id).toBe('123e4567-e89b-12d3-a456-426614174000');
  });
});
