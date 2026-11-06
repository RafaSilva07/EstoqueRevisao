import { Injectable, Scope } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { redactSensitive } from '../../shared/security/redact-sensitive';
import { paginate, PaginatedResult } from '../../shared/pagination/paginated-result.interface';
import { SystemLogEntity, SystemLogLevel } from './entities/system-log.entity';
import { SystemLogsRepository } from './system-logs.repository';
import { CreateSystemLogDto } from './dto/create-system-log.dto';
import { SystemLogQueryDto } from './dto/system-log-query.dto';
import { AlertConditionStatus, RecurringErrorSummary, SystemLogMetricsDto } from './dto/system-log-metrics.dto';

@Injectable({ scope: Scope.DEFAULT })
export class SystemLogsService {
  private readonly defaultAlertThreshold = 10;
  private readonly defaultWindowMinutes = 5;

  constructor(
    private readonly repository: SystemLogsRepository,
    private readonly configService: ConfigService,
  ) {}

  async createLog(dto: CreateSystemLogDto): Promise<SystemLogEntity> {
    const environment = dto.environment ?? this.configService.get<string>('NODE_ENV', 'development');
    const sanitizedDetails = dto.details ? (redactSensitive(dto.details) as Record<string, unknown>) : null;

    const log = new SystemLogEntity();
    log.id = randomUUID();
    log.timestamp = dto.timestamp ? new Date(dto.timestamp) : new Date();
    log.level = dto.level;
    log.errorCode = dto.errorCode ?? null;
    log.eventId = dto.eventId || randomUUID();
    log.description = dto.description;
    log.context = dto.context || 'Application';
    log.details = sanitizedDetails;
    log.environment = environment;

    // Emite no console/stream como JSON estruturado para observabilidade de contêineres/cloud
    this.emitStructuredJson(log);

    // Persiste no repositório resiliente (banco + memória)
    return this.repository.save(log);
  }

  async info(params: {
    description: string;
    context: string;
    eventId?: string;
    details?: Record<string, unknown>;
  }): Promise<SystemLogEntity> {
    return this.createLog({
      level: 'INFO',
      description: params.description,
      context: params.context,
      eventId: params.eventId || randomUUID(),
      details: params.details,
    });
  }

  async warn(params: {
    description: string;
    context: string;
    errorCode?: string | null;
    eventId?: string;
    details?: Record<string, unknown>;
  }): Promise<SystemLogEntity> {
    return this.createLog({
      level: 'WARN',
      description: params.description,
      context: params.context,
      errorCode: params.errorCode,
      eventId: params.eventId || randomUUID(),
      details: params.details,
    });
  }

  async error(params: {
    description: string;
    context: string;
    errorCode?: string | null;
    eventId?: string;
    details?: Record<string, unknown>;
  }): Promise<SystemLogEntity> {
    return this.createLog({
      level: 'ERROR',
      description: params.description,
      context: params.context,
      errorCode: params.errorCode,
      eventId: params.eventId || randomUUID(),
      details: params.details,
    });
  }

  async fatal(params: {
    description: string;
    context: string;
    errorCode?: string | null;
    eventId?: string;
    details?: Record<string, unknown>;
  }): Promise<SystemLogEntity> {
    return this.createLog({
      level: 'FATAL',
      description: params.description,
      context: params.context,
      errorCode: params.errorCode,
      eventId: params.eventId || randomUUID(),
      details: params.details,
    });
  }

  async queryLogs(query: SystemLogQueryDto): Promise<PaginatedResult<SystemLogEntity>> {
    const [items, total] = await this.repository.findAndCount(query);
    return paginate(items, total, query.page, query.limit);
  }

  async getLogById(id: string): Promise<SystemLogEntity | null> {
    return this.repository.findById(id);
  }

  async getCountByErrorCode(periodStart?: Date): Promise<Array<{ errorCode: string; count: number; sampleDescription: string; severity: SystemLogLevel; lastOccurrence: Date }>> {
    return this.repository.countByErrorCode(periodStart);
  }

  async getMetrics(
    windowMinutes = this.defaultWindowMinutes,
    alertThreshold = this.defaultAlertThreshold,
  ): Promise<SystemLogMetricsDto> {
    const now = new Date();
    const windowStart = new Date(now.getTime() - windowMinutes * 60 * 1000);

    const [totalCounts, windowCounts, recurringErrors, recentLogs] = await Promise.all([
      this.repository.getCountsByLevel(),
      this.repository.getCountsByLevel(windowStart),
      this.repository.countByErrorCode(),
      this.repository.getRecentLogs(300),
    ]);

    const totalLogs = totalCounts.INFO + totalCounts.WARN + totalCounts.ERROR + totalCounts.FATAL;
    const totalErrors = totalCounts.WARN + totalCounts.ERROR + totalCounts.FATAL;
    const errorRatePercentage = totalLogs > 0 ? Number(((totalErrors / totalLogs) * 100).toFixed(2)) : 0;

    const criticalErrorsInWindow = windowCounts.ERROR + windowCounts.FATAL;
    const alertTriggered = criticalErrorsInWindow >= alertThreshold;

    let alertStatus: AlertConditionStatus['status'] = 'NORMAL';
    let alertMessage = `Operação estável. ${criticalErrorsInWindow} erros críticos registrados na janela recente de ${windowMinutes} minutos.`;

    if (alertTriggered) {
      alertStatus = 'CRITICAL';
      alertMessage = `ALERTA DE INCIDENTE: ${criticalErrorsInWindow} erros críticos registrados nos últimos ${windowMinutes} minutos, ultrapassando o limiar de tolerância (${alertThreshold})!`;
    } else if (criticalErrorsInWindow > 0) {
      alertStatus = 'WARNING';
      alertMessage = `ATENÇÃO: ${criticalErrorsInWindow} erros críticos registrados nos últimos ${windowMinutes} minutos (limiar de alerta: ${alertThreshold}).`;
    }

    const alert: AlertConditionStatus = {
      triggered: alertTriggered,
      status: alertStatus,
      condition: `Mais de ${alertThreshold} erros críticos em ${windowMinutes} minutos`,
      threshold: alertThreshold,
      windowMinutes,
      criticalErrorsInWindow,
      message: alertMessage,
    };

    const topRecurringErrors: RecurringErrorSummary[] = recurringErrors.map((item) => ({
      errorCode: item.errorCode,
      count: item.count,
      percentage: totalErrors > 0 ? Number(((item.count / totalErrors) * 100).toFixed(1)) : 0,
      lastOccurrence: item.lastOccurrence.toISOString(),
      sampleDescription: item.sampleDescription,
      severity: item.severity as 'WARN' | 'ERROR' | 'FATAL',
    }));

    // Agrupamento temporal para gráficos / timeline (slots de 5 minutos na última hora)
    const timeline = this.buildTimeline(recentLogs);

    return {
      totalLogs,
      countsByLevel: totalCounts,
      errorRatePercentage,
      metricsPeriod: {
        start: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
        end: now.toISOString(),
      },
      alert,
      topRecurringErrors,
      timeline,
    };
  }

  private buildTimeline(logs: SystemLogEntity[]): Array<{ timeSlot: string; info: number; warn: number; error: number }> {
    const slots = new Map<string, { info: number; warn: number; error: number }>();
    const now = new Date();

    // Cria os últimos 6 slots de 10 minutos
    for (let i = 5; i >= 0; i--) {
      const slotTime = new Date(now.getTime() - i * 10 * 60 * 1000);
      const key = `${slotTime.getHours().toString().padStart(2, '0')}:${(Math.floor(slotTime.getMinutes() / 10) * 10).toString().padStart(2, '0')}`;
      slots.set(key, { info: 0, warn: 0, error: 0 });
    }

    for (const log of logs) {
      const t = new Date(log.timestamp);
      const key = `${t.getHours().toString().padStart(2, '0')}:${(Math.floor(t.getMinutes() / 10) * 10).toString().padStart(2, '0')}`;
      const slot = slots.get(key);
      if (slot) {
        if (log.level === 'INFO') slot.info += 1;
        else if (log.level === 'WARN') slot.warn += 1;
        else slot.error += 1;
      }
    }

    return Array.from(slots.entries()).map(([timeSlot, counts]) => ({
      timeSlot,
      ...counts,
    }));
  }

  private emitStructuredJson(log: SystemLogEntity): void {
    const payload = {
      timestamp: log.timestamp.toISOString(),
      level: log.level,
      errorCode: log.errorCode,
      eventId: log.eventId,
      description: log.description,
      context: log.context,
      environment: log.environment,
      details: log.details,
    };

    const serialized = `${JSON.stringify(payload)}\n`;
    if (log.level === 'ERROR' || log.level === 'FATAL') {
      process.stderr.write(serialized);
    } else {
      process.stdout.write(serialized);
    }
  }
}

