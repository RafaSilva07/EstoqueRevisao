import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Public } from '../auth/decorators/public.decorator';

interface HealthResponse {
  status: 'up';
  timestamp: string;
  database: 'up';
}

@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Public()
  @Get()
  async check(): Promise<HealthResponse> {
    let schema: Array<{ logsProtected: boolean }>;
    try {
      schema = await this.dataSource.query<Array<{ logsProtected: boolean }>>(
        "SELECT relrowsecurity AS \"logsProtected\" FROM pg_class WHERE oid = to_regclass('system_logs')",
      );
    } catch {
      throw new ServiceUnavailableException({
        code: 'DATABASE_UNAVAILABLE',
        message: 'O banco de dados esta indisponivel.',
      });
    }
    if (!schema[0]?.logsProtected) {
      throw new ServiceUnavailableException({
        code: 'DATABASE_SCHEMA_NOT_READY',
        message: 'O banco de dados precisa ser atualizado.',
      });
    }

    return {
      status: 'up',
      timestamp: new Date().toISOString(),
      database: 'up',
    };
  }
}
