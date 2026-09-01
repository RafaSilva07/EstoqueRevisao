import { Request } from 'express';
import { AuditRequestMetadata } from './audit.types';

export function getAuditRequestMetadata(request: Request): AuditRequestMetadata {
  const forwardedFor = request.header('x-forwarded-for')?.split(',')[0]?.trim();
  const userAgent = request.header('user-agent');

  return {
    requestId: request.requestId,
    ipAddress: forwardedFor ?? request.ip ?? null,
    userAgent: userAgent?.slice(0, 500) ?? null,
  };
}
