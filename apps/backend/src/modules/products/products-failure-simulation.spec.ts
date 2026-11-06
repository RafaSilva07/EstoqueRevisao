import { ArgumentsHost, ConflictException, HttpStatus, NotFoundException } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ProductUnitConversionsService } from './product-unit-conversions.service';
import { GlobalExceptionFilter } from '../../shared/http/global-exception.filter';
import { AppLogger } from '../../shared/logging/app-logger.service';
import { SystemLogsService } from '../system-logs/system-logs.service';

describe('Tratamento de Falhas e Registro de Logs (Simulações)', () => {
  let controller: ProductsController;
  let filter: GlobalExceptionFilter;
  let loggerMock: jest.Mocked<Partial<AppLogger>>;
  let systemLogsServiceMock: jest.Mocked<Partial<SystemLogsService>>;

  beforeEach(() => {
    const productsService = {} as ProductsService;
    const conversionsService = {} as ProductUnitConversionsService;
    controller = new ProductsController(productsService, conversionsService);

    loggerMock = {
      setContext: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      log: jest.fn(),
    };

    systemLogsServiceMock = {
      createLog: jest.fn().mockResolvedValue({} as never),
      warn: jest.fn().mockResolvedValue({} as never),
      error: jest.fn().mockResolvedValue({} as never),
      fatal: jest.fn().mockResolvedValue({} as never),
    };

    filter = new GlobalExceptionFilter(
      loggerMock as AppLogger,
      systemLogsServiceMock as SystemLogsService,
    );
  });

  const createMockHost = (requestId = 'req-abc-999') => {
    let capturedStatus: number | null = null;
    let capturedBody: any = null;

    const host = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'GET',
          path: '/api/v1/products/simulate',
          requestId,
          ip: '127.0.0.1',
        }),
        getResponse: () => ({
          status: (s: number) => {
            capturedStatus = s;
            return {
              json: (b: any) => {
                capturedBody = b;
              },
            };
          },
        }),
      }),
    } as unknown as ArgumentsHost;

    return {
      host,
      getStatus: () => capturedStatus,
      getBody: () => capturedBody,
    };
  };

  describe('1. Falhas Esperadas (Client Handled - 4xx)', () => {
    it('deve simular falha esperada de Conflito de Dados (409 Conflict) e registrar log WARN', () => {
      let thrown: unknown;
      try {
        controller.simulateExpectedConflict();
      } catch (err) {
        thrown = err;
      }

      expect(thrown).toBeInstanceOf(ConflictException);
      const mockHost = createMockHost('req-conflict-1');
      filter.catch(thrown, mockHost.host);

      expect(mockHost.getStatus()).toBe(HttpStatus.CONFLICT);
      const body = mockHost.getBody();
      expect(body.error.code).toBe('PRODUCT_CODE_ALREADY_EXISTS');
      expect(body.error.message).toContain('Conflito de dados');
      expect(body.error.requestId).toBe('req-conflict-1');

      // Verifica se logou como WARN com código e detalhes estruturados
      expect(systemLogsServiceMock.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          errorCode: 'PRODUCT_CODE_ALREADY_EXISTS',
          eventId: 'req-conflict-1',
          context: 'GlobalExceptionFilter',
        }),
      );
    });

    it('deve simular falha esperada de Recurso Não Encontrado (404 Not Found) e registrar log WARN', () => {
      let thrown: unknown;
      try {
        controller.simulateExpectedNotFound();
      } catch (err) {
        thrown = err;
      }

      expect(thrown).toBeInstanceOf(NotFoundException);
      const mockHost = createMockHost('req-notfound-2');
      filter.catch(thrown, mockHost.host);

      expect(mockHost.getStatus()).toBe(HttpStatus.NOT_FOUND);
      const body = mockHost.getBody();
      expect(body.error.code).toBe('PRODUCT_NOT_FOUND');
      expect(body.error.message).toContain('nao foi localizado no catalogo');

      expect(systemLogsServiceMock.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          errorCode: 'PRODUCT_NOT_FOUND',
          eventId: 'req-notfound-2',
        }),
      );
    });
  });

  describe('2. Falhas Inesperadas (Server / Database - 5xx)', () => {
    it('deve simular falha inesperada de Indisponibilidade do Banco de Dados (503) e registrar log FATAL/ERROR', () => {
      let thrown: unknown;
      try {
        controller.simulateUnexpectedDatabase();
      } catch (err) {
        thrown = err;
      }

      const mockHost = createMockHost('req-db-fail-3');
      filter.catch(thrown, mockHost.host);

      expect(mockHost.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      const body = mockHost.getBody();
      expect(body.error.code).toBe('DATABASE_UNAVAILABLE');
      expect(body.error.message).toContain('temporariamente indisponivel');
      // Garante que não expôs detalhes sensíveis nem stack trace
      expect(body.error.stack).toBeUndefined();

      expect(systemLogsServiceMock.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'FATAL',
          errorCode: 'DATABASE_UNAVAILABLE',
          eventId: 'req-db-fail-3',
        }),
      );
    });

    it('deve simular falha inesperada interna (500 Internal Server Error) e registrar log ERROR', () => {
      let thrown: unknown;
      try {
        controller.simulateUnexpectedCrash();
      } catch (err) {
        thrown = err;
      }

      const mockHost = createMockHost('req-crash-4');
      filter.catch(thrown, mockHost.host);

      expect(mockHost.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      const body = mockHost.getBody();
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(body.error.message).toBe('Ocorreu um erro interno inesperado.');
      expect(body.error.stack).toBeUndefined();

      expect(systemLogsServiceMock.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'ERROR',
          errorCode: 'INTERNAL_ERROR',
          eventId: 'req-crash-4',
        }),
      );
    });
  });
});

