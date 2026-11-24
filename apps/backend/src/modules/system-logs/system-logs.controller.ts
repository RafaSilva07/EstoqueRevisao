import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PaginatedResult } from '../../shared/pagination/paginated-result.interface';
import { AdminGuard } from '../users/admin.guard';
import { SystemLogEntity } from './entities/system-log.entity';
import { SystemLogsService } from './system-logs.service';
import { SystemLogQueryDto } from './dto/system-log-query.dto';
import { SystemLogMetricsDto } from './dto/system-log-metrics.dto';

@Controller('logs')
@UseGuards(AdminGuard)
export class SystemLogsController {
  constructor(private readonly logsService: SystemLogsService) {}

  @Get()
  list(@Query() query: SystemLogQueryDto): Promise<PaginatedResult<SystemLogEntity>> {
    return this.logsService.queryLogs(query);
  }

  @Get('metrics')
  metrics(
    @Query('windowMinutes') windowMinutes?: number,
    @Query('alertThreshold') alertThreshold?: number,
  ): Promise<SystemLogMetricsDto> {
    const wm = windowMinutes ? Number(windowMinutes) : undefined;
    const th = alertThreshold ? Number(alertThreshold) : undefined;
    return this.logsService.getMetrics(wm, th);
  }

  @Get('stats/count-by-error')
  countByError(
    @Query('periodStart') periodStart?: string,
  ): Promise<Array<{ errorCode: string; count: number; sampleDescription: string; severity: string; lastOccurrence: Date }>> {
    const date = periodStart ? new Date(periodStart) : undefined;
    return this.logsService.getCountByErrorCode(date);
  }

  @Get(':id')
  async getById(@Param('id', new ParseUUIDPipe()) id: string): Promise<SystemLogEntity> {
    const log = await this.logsService.getLogById(id);
    if (!log) {
      throw new NotFoundException({
        code: 'LOG_ENTRY_NOT_FOUND',
        message: `Registro de log com ID '${id}' nao foi encontrado.`,
      });
    }
    return log;
  }
}

