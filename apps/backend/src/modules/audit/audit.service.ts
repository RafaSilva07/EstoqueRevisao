import { Injectable } from '@nestjs/common';
import { redactSensitive } from '../../shared/security/redact-sensitive';
import { AuditRecordInput } from './audit.types';
import { AuditRepository } from './audit.repository';
import { AuditLogEntity } from './entities/audit-log.entity';

@Injectable()
export class AuditService {
  constructor(private readonly auditRepository: AuditRepository) {}

  async record(input: AuditRecordInput): Promise<void> {
    const log = new AuditLogEntity();
    log.userId = input.userId;
    log.action = input.action;
    log.entityType = input.entityType;
    log.entityId = input.entityId ?? null;
    log.result = input.result;
    log.oldValues = this.toAuditValues(input.oldValues);
    log.newValues = this.toAuditValues(input.newValues);
    log.ipAddress = input.ipAddress;
    log.userAgent = input.userAgent;
    log.requestId = input.requestId;

    await this.auditRepository.save(log, input.manager);
  }

  private toAuditValues(values: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
    if (!values) {
      return null;
    }
    return redactSensitive(values) as Record<string, unknown>;
  }
}
