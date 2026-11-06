export interface LogCountByLevel {
  INFO: number;
  WARN: number;
  ERROR: number;
  FATAL: number;
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

export interface SystemLogMetricsDto {
  totalLogs: number;
  countsByLevel: LogCountByLevel;
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

