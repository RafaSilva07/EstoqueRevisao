import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AppLogger } from '../logging/app-logger.service';

interface ErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLogger) {
    this.logger.setContext(GlobalExceptionFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const error = this.toErrorPayload(exception, status);

    if (status >= 500) {
      this.logger.error({
        event: 'unhandled_exception',
        exception,
        method: request.method,
        path: request.path,
      });
    }

    response.status(status).json({
      error: {
        ...error,
        requestId: request.requestId,
        timestamp: new Date().toISOString(),
        path: request.path,
      },
    });
  }

  private toErrorPayload(exception: unknown, status: number): ErrorPayload {
    if (!(exception instanceof HttpException)) {
      return {
        code: 'INTERNAL_ERROR',
        message: 'Ocorreu um erro interno inesperado.',
      };
    }

    const response = exception.getResponse();
    if (typeof response === 'string') {
      return { code: this.defaultCode(status), message: response };
    }

    const body = response as Record<string, unknown>;
    return {
      code: typeof body.code === 'string' ? body.code : this.defaultCode(status),
      message: this.extractMessage(body.message, status),
      ...(body.details === undefined ? {} : { details: body.details }),
    };
  }

  private extractMessage(message: unknown, status: number): string {
    if (typeof message === 'string') {
      return message;
    }
    return HttpStatus[status] ?? 'Erro na requisicao.';
  }

  private defaultCode(status: number): string {
    const codes: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE_ENTITY',
      503: 'SERVICE_UNAVAILABLE',
    };
    return codes[status] ?? 'HTTP_ERROR';
  }
}
