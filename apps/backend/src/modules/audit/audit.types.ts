import { EntityManager } from 'typeorm';

export interface AuditRequestMetadata {
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface AuditRecordInput extends AuditRequestMetadata {
  userId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  result: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  manager?: EntityManager;
}
