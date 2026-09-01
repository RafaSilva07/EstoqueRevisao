import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { AppLogger } from './app-logger.service';
import { RequestContextService } from './request-context.service';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext(RequestContextMiddleware.name);
  }

  use(request: Request, response: Response, next: NextFunction): void {
    const incomingRequestId = request.header('x-request-id');
    const requestId = incomingRequestId && uuidPattern.test(incomingRequestId)
      ? incomingRequestId
      : randomUUID();
    const startedAt = performance.now();

    request.requestId = requestId;
    response.setHeader('x-request-id', requestId);

    this.requestContext.run(requestId, () => {
      response.once('finish', () => {
        this.logger.log({
          event: 'http_request_completed',
          method: request.method,
          path: request.path,
          statusCode: response.statusCode,
          durationMs: Number((performance.now() - startedAt).toFixed(2)),
        });
      });
      next();
    });
  }
}
