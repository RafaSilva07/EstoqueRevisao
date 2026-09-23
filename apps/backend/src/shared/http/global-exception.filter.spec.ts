import { ArgumentsHost, HttpStatus } from '@nestjs/common';
import { AppLogger } from '../logging/app-logger.service';
import { GlobalExceptionFilter } from './global-exception.filter';

interface FakeResponse {
  status(statusCode: number): FakeResponse;
  json(body: unknown): void;
}

describe('GlobalExceptionFilter', () => {
  const statusCall = jest.fn<void, [number]>();
  const json = jest.fn<void, [unknown]>();
  const response: FakeResponse = {
    status(statusCode: number): FakeResponse {
      statusCall(statusCode);
      return response;
    },
    json(body: unknown): void {
      json(body);
    },
  };
  const logger = {
    setContext: jest.fn(),
    error: jest.fn(),
  } as unknown as AppLogger;
  const host = {
    switchToHttp: () => ({
      getRequest: (): { method: string; path: string; requestId: string } => ({
        method: 'GET',
        path: '/api/v1/stocks',
        requestId: 'request-id',
      }),
      getResponse: (): typeof response => response,
    }),
  } as unknown as ArgumentsHost;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 503 when a nested database connection is reset', () => {
    const filter = new GlobalExceptionFilter(logger);

    filter.catch({ driverError: { code: 'ECONNRESET' } }, host);

    expect(statusCall).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    const body = json.mock.calls[0]?.[0] as {
      error: { code: string; message: string; requestId: string };
    };
    expect(body.error.code).toBe('DATABASE_UNAVAILABLE');
    expect(body.error.message).toContain('temporariamente indisponivel');
    expect(body.error.requestId).toBe('request-id');
  });

  it('keeps unexpected programming errors as internal errors', () => {
    const filter = new GlobalExceptionFilter(logger);

    filter.catch(new Error('unexpected'), host);

    expect(statusCall).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    const body = json.mock.calls[0]?.[0] as { error: { code: string } };
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });
});
