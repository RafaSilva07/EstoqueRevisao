import { Injectable, LoggerService, Scope } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { redactSensitive } from '../security/redact-sensitive';
import { RequestContextService } from './request-context.service';

type LogLevel = 'debug' | 'log' | 'warn' | 'error' | 'fatal';

const levelPriority: Record<LogLevel, number> = {
  debug: 10,
  log: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

@Injectable({ scope: Scope.TRANSIENT })
export class AppLogger implements LoggerService {
  private context?: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly requestContext: RequestContextService,
  ) {}

  setContext(context: string): void {
    this.context = context;
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write('log', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write('debug', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write('warn', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write('error', message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.write('fatal', message, optionalParams);
  }

  private write(level: LogLevel, message: unknown, optionalParams: unknown[]): void {
    if (!this.isEnabled(level)) {
      return;
    }

    const contextFromParams = [...optionalParams]
      .reverse()
      .find((parameter): parameter is string => typeof parameter === 'string');
    const payload = {
      timestamp: new Date().toISOString(),
      level: level === 'log' ? 'info' : level,
      context: contextFromParams ?? this.context,
      requestId: this.requestContext.getRequestId(),
      message: typeof message === 'string' ? message : undefined,
      data: typeof message === 'string' ? redactSensitive(optionalParams) : redactSensitive(message),
    };

    const output = `${JSON.stringify(payload)}\n`;
    if (levelPriority[level] >= levelPriority.error) {
      process.stderr.write(output);
    } else {
      process.stdout.write(output);
    }
  }

  private isEnabled(level: LogLevel): boolean {
    const configured = this.configService.get<string>('LOG_LEVEL', 'info');
    const normalized: LogLevel = configured === 'info' ? 'log' : this.toLogLevel(configured);
    return levelPriority[level] >= levelPriority[normalized];
  }

  private toLogLevel(level: string): LogLevel {
    return level in levelPriority ? (level as LogLevel) : 'log';
  }
}
