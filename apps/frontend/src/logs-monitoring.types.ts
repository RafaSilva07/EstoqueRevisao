import { Paginated } from './api';

export type SystemLogLevel = 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

export interface SystemLog {
  id: string;
  timestamp: string;
  level: SystemLogLevel;
  errorCode: string | null;
  eventId: string;
  description: string;
  context: string;
  details: Record<string, unknown> | null;
  environment: string;
}

export interface RecurringErrorSummary {
  errorCode: string;
  count: number;
  percentage: number;
  lastOccurrence: string;
  sampleDescription: string;
  severity: 'WARN' | 'ERROR' | 'FATAL';
}

export interface AlertConditionStatus {
  triggered: boolean;
  status: 'NORMAL' | 'WARNING' | 'CRITICAL';
  condition: string;
  threshold: number;
  windowMinutes: number;
  criticalErrorsInWindow: number;
  message: string;
}

export interface SystemLogMetrics {
  totalLogs: number;
  countsByLevel: {
    INFO: number;
    WARN: number;
    ERROR: number;
    FATAL: number;
  };
  errorRatePercentage: number;
  metricsPeriod: {
    start: string;
    end: string;
  };
  alert: AlertConditionStatus;
  topRecurringErrors: RecurringErrorSummary[];
  timeline: Array<{
    timeSlot: string;
    info: number;
    warn: number;
    error: number;
  }>;
}

export interface LogFilterParams {
  search?: string;
  level?: string;
  errorCode?: string;
  eventId?: string;
  context?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export type PaginatedLogs = Paginated<SystemLog>;

