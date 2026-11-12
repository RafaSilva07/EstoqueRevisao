import { Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { redactSensitive } from '../../shared/security/redact-sensitive';
import { AuditRecordInput } from './audit.types';
import { AuditRepository } from './audit.repository';
import { AuditLogEntity } from './entities/audit-log.entity';
import { SystemLogsService } from '../system-logs/system-logs.service';

@Injectable()
export class AuditService {
  constructor(
    private readonly auditRepository: AuditRepository,
    @Optional() private readonly systemLogsService?: SystemLogsService,
  ) {}

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

    if (this.systemLogsService) {
      const description = this.formatDescription(input);
      const context = this.resolveContext(input);
      const eventId =
        (input.newValues?.codigoMovimentacao as string) ||
        (input.newValues?.code as string) ||
        input.entityId ||
        input.requestId ||
        randomUUID();

      this.systemLogsService
        .createLog({
          level: input.result === 'FAILURE' ? 'WARN' : 'INFO',
          context,
          eventId,
          description,
          details: {
            action: input.action,
            userId: input.userId,
            result: input.result,
            entityId: input.entityId,
            ...(input.newValues ? (redactSensitive(input.newValues) as Record<string, unknown>) : {}),
          },
        })
        .catch(() => undefined);
    }
  }

  private resolveContext(input: AuditRecordInput): string {
    switch (input.entityType) {
      case 'SHIPMENT':
        return 'ShipmentsService';
      case 'PRODUCT':
        return 'ProductsService';
      case 'AUTH_SESSION':
      case 'USER':
      case 'ROLE':
        return 'AuthService';
      case 'MOVEMENT':
        return 'MovementsService';
      case 'SYSTEM_SETTING':
      case 'REVIEW_PROCESS_CONFIGURATION':
        return 'SettingsService';
      default:
        return input.entityType || 'BusinessService';
    }
  }

  private formatDescription(input: AuditRecordInput): string {
    const code =
      (input.newValues?.codigoMovimentacao as string) ||
      (input.newValues?.code as string);
    const codeSuffix = code ? ` [${code}]` : input.entityId ? ` [${input.entityId}]` : '';

    switch (input.action) {
      case 'SHIPMENT_CREATE':
        return `Novo envio de remessa registrado${codeSuffix}.`;
      case 'SHIPMENT_CONFIRM':
        return `Recebimento de remessa confirmado com sucesso${codeSuffix}.`;
      case 'SHIPMENT_SEPARATION_START':
        return `Recebimento confirmado com separação imediata iniciada${codeSuffix}.`;
      case 'SHIPMENT_SEPARATION_DRAFT_SAVE':
        return `Rascunho de separação salvo com sucesso${codeSuffix}.`;
      case 'SHIPMENT_SEPARATION_COMPLETE':
        return `Separação de remessa concluída com sucesso e saldo consolidado${codeSuffix}.`;
      case 'SHIPMENT_IMMEDIATE_RETURN_CREATE':
        return `Remessa de retorno imediato gerada a partir da separação${codeSuffix}.`;
      case 'SHIPMENT_REFUSE':
        return `Recebimento de remessa recusado${codeSuffix}.`;
      case 'SHIPMENT_CANCEL':
        return `Envio de remessa cancelado pelo remetente${codeSuffix}.`;
      case 'SHIPMENT_ADMIN_CANCEL':
        return `Envio cancelado administrativamente${codeSuffix}.`;
      case 'SHIPMENT_ADMIN_CORRECTION':
        return `Correção administrativa de remessa realizada${codeSuffix}.`;
      case 'SHIPMENT_SEPARATION_EXPIRE':
        return `Tempo limite de separação expirado para a remessa${codeSuffix}.`;
      case 'SHIPMENT_MOVEMENT_CREATE':
        return `Movimentação de estoque registrada para remessa${codeSuffix}.`;
      case 'PRODUCT_CREATE':
        return `Novo produto cadastrado no catálogo${codeSuffix}.`;
      case 'PRODUCT_UPDATE':
        return `Cadastro de produto atualizado${codeSuffix}.`;
      case 'EXTERNAL_ENTRY_CREATE':
        return `Entrada externa de estoque registrada${codeSuffix}.`;
      case 'INTERNAL_TRANSFER_CREATE':
        return `Transferência interna de estoque realizada${codeSuffix}.`;
      case 'AUTH_LOGIN':
        return `Autenticação de usuário realizada com sucesso${codeSuffix}.`;
      case 'AUTH_LOGIN_FAILED':
        return `Tentativa de autenticação de usuário falhou${codeSuffix}.`;
      default:
        return `Operação ${input.action} executada com ${input.result === 'SUCCESS' ? 'sucesso' : 'falha'} em ${input.entityType}${codeSuffix}.`;
    }
  }

  private toAuditValues(values: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
    if (!values) {
      return null;
    }
    return redactSensitive(values) as Record<string, unknown>;
  }
}
