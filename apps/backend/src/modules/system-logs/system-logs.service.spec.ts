import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { SystemLogsService } from './system-logs.service';
import { SystemLogsRepository } from './system-logs.repository';
import { SystemLogQueryDto } from './dto/system-log-query.dto';
import { SystemLogEntity } from './entities/system-log.entity';

describe('SystemLogsService', () => {
  let service: SystemLogsService;
  let repository: SystemLogsRepository;
  let mockDataSource: jest.Mocked<Partial<DataSource>>;

  beforeEach(() => {
    mockDataSource = {
      isInitialized: false,
      getRepository: jest.fn(),
    } as unknown as jest.Mocked<Partial<DataSource>>;

    repository = new SystemLogsRepository(mockDataSource as unknown as DataSource);
    const configService = {
      get: jest.fn((key: string, defaultVal: string) => defaultVal),
    } as unknown as ConfigService;

    service = new SystemLogsService(repository, configService);
  });

  describe('Registro estruturado de logs e sanitização', () => {
    it('deve registrar log estruturado com campos obrigatórios e sanitizar dados confidenciais', async () => {
      const log = await service.createLog({
        level: 'WARN',
        errorCode: 'PRODUCT_NOT_FOUND',
        eventId: 'req-uuid-1234',
        description: 'Produto com identificador solicitado nao foi localizado.',
        context: 'ProductsController',
        details: {
          productId: 'prod-456',
          password: 'segredo_que_nao_pode_vazar',
          token: 'jwt_bearer_token_secreto',
          authorization: 'Bearer 123456',
        },
      });

      expect(log.id).toBeDefined();
      expect(log.timestamp).toBeInstanceOf(Date);
      expect(log.level).toBe('WARN');
      expect(log.errorCode).toBe('PRODUCT_NOT_FOUND');
      expect(log.eventId).toBe('req-uuid-1234');
      expect(log.description).toContain('Produto com identificador solicitado nao foi localizado.');
      expect(log.context).toBe('ProductsController');

      // Verifica que dados sensíveis foram mascarados/sanitizados
      expect(log.details?.password).toBe('[REDACTED]');
      expect(log.details?.token).toBe('[REDACTED]');
      expect(log.details?.authorization).toBe('[REDACTED]');
      expect(log.details?.productId).toBe('prod-456');
    });

    it('deve registrar logs auxiliares info, warn e error corretamente', async () => {
      const infoLog = await service.info({
        description: 'Servico inicializado com sucesso',
        context: 'Bootstrap',
      });
      expect(infoLog.level).toBe('INFO');

      const warnLog = await service.warn({
        description: 'Tentativa de cadastro com codigo duplicado',
        context: 'ProductsService',
        errorCode: 'PRODUCT_CODE_ALREADY_EXISTS',
      });
      expect(warnLog.level).toBe('WARN');
      expect(warnLog.errorCode).toBe('PRODUCT_CODE_ALREADY_EXISTS');

      const errorLog = await service.error({
        description: 'Conexao com banco PostgreSQL expirou',
        context: 'DatabaseConnection',
        errorCode: 'DATABASE_UNAVAILABLE',
      });
      expect(errorLog.level).toBe('ERROR');
      expect(errorLog.errorCode).toBe('DATABASE_UNAVAILABLE');
    });
  });

  describe('Gerenciamento e Consulta de Logs com filtros', () => {
    beforeEach(async () => {
      // Injeta logs de teste
      await service.createLog({
        level: 'INFO',
        eventId: 'ev-1',
        description: 'Usuario admin efetuou login no sistema',
        context: 'AuthService',
        timestamp: new Date('2026-11-06T10:00:00Z'),
      });

      await service.createLog({
        level: 'WARN',
        errorCode: 'PRODUCT_NOT_FOUND',
        eventId: 'ev-2',
        description: 'Produto solicitado nao encontrado no catalogo',
        context: 'ProductsController',
        timestamp: new Date('2026-11-06T11:00:00Z'),
      });

      await service.createLog({
        level: 'WARN',
        errorCode: 'PRODUCT_CODE_ALREADY_EXISTS',
        eventId: 'ev-3',
        description: 'Ja existe um produto com o codigo PRD-001',
        context: 'ProductsController',
        timestamp: new Date('2026-11-06T12:00:00Z'),
      });

      await service.createLog({
        level: 'ERROR',
        errorCode: 'DATABASE_UNAVAILABLE',
        eventId: 'ev-4',
        description: 'Falha inesperada ao conectar no PostgreSQL',
        context: 'GlobalExceptionFilter',
        timestamp: new Date('2026-11-06T13:00:00Z'),
      });
    });

    it('deve consultar logs com paginacao', async () => {
      const result = await service.queryLogs({ page: 1, limit: 2 } as SystemLogQueryDto);
      expect(result.items.length).toBe(2);
      expect(result.meta.total).toBe(4);
      expect(result.meta.totalPages).toBe(2);
    });

    it('deve filtrar logs por nivel de criticidade', async () => {
      const result = await service.queryLogs({ level: 'ERROR', page: 1, limit: 10 } as SystemLogQueryDto);
      expect(result.items.length).toBe(1);
      expect(result.items[0]?.errorCode).toBe('DATABASE_UNAVAILABLE');
    });

    it('deve filtrar logs por codigo de erro', async () => {
      const result = await service.queryLogs({ errorCode: 'PRODUCT_NOT_FOUND', page: 1, limit: 10 } as SystemLogQueryDto);
      expect(result.items.length).toBe(1);
      expect(result.items[0]?.context).toBe('ProductsController');
    });

    it('deve realizar busca textual por palavra-chave na descricao', async () => {
      const result = await service.queryLogs({ search: 'PostgreSQL', page: 1, limit: 10 } as SystemLogQueryDto);
      expect(result.items.length).toBe(1);
      expect(result.items[0]?.level).toBe('ERROR');
    });

    it('deve filtrar logs por periodo de data/hora', async () => {
      const result = await service.queryLogs({
        startDate: '2026-11-06T10:30:00Z',
        endDate: '2026-11-06T12:30:00Z',
        page: 1,
        limit: 10,
      } as SystemLogQueryDto);

      expect(result.items.length).toBe(2);
      expect(result.items.some((l: SystemLogEntity) => l.eventId === 'ev-2')).toBe(true);
      expect(result.items.some((l: SystemLogEntity) => l.eventId === 'ev-3')).toBe(true);
    });

    it('deve identificar a quantidade de ocorrencias de determinado erro', async () => {
      await service.warn({
        errorCode: 'PRODUCT_NOT_FOUND',
        description: 'Outro produto nao encontrado',
        context: 'ProductsController',
      });

      const counts = await service.getCountByErrorCode();
      const productNotFound = counts.find((c) => c.errorCode === 'PRODUCT_NOT_FOUND');
      expect(productNotFound).toBeDefined();
      expect(productNotFound?.count).toBe(2);
    });
  });

  describe('Monitoramento, Métricas e Condição de Alerta', () => {
    it('deve retornar status NORMAL quando nao ha erros criticos recentes', async () => {
      await service.info({ description: 'Operacao normal', context: 'App' });
      await service.warn({ description: 'Alerta menor', context: 'App', errorCode: 'WARN_1' });

      const metrics = await service.getMetrics(5, 10);
      expect(metrics.totalLogs).toBe(2);
      expect(metrics.alert.triggered).toBe(false);
      expect(metrics.alert.status).toBe('NORMAL');
      expect(metrics.alert.criticalErrorsInWindow).toBe(0);
    });

    it('deve disparar a condicao de alerta (CRITICAL) quando ocorrerem mais de 10 erros criticos em 5 minutos', async () => {
      // Dispara 11 erros críticos recentes
      for (let i = 1; i <= 11; i++) {
        await service.error({
          errorCode: 'DATABASE_UNAVAILABLE',
          description: `Falha de conexao repetida #${i}`,
          context: 'DatabaseManager',
        });
      }

      const metrics = await service.getMetrics(5, 10);
      expect(metrics.alert.criticalErrorsInWindow).toBe(11);
      expect(metrics.alert.triggered).toBe(true);
      expect(metrics.alert.status).toBe('CRITICAL');
      expect(metrics.alert.message).toContain('ALERTA DE INCIDENTE');

      // Verifica identificação de erros recorrentes
      expect(metrics.topRecurringErrors.length).toBeGreaterThan(0);
      expect(metrics.topRecurringErrors[0]?.errorCode).toBe('DATABASE_UNAVAILABLE');
      expect(metrics.topRecurringErrors[0]?.count).toBe(11);
    });
  });
});
