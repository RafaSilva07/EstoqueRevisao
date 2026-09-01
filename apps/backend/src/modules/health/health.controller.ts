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
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException({
        code: 'DATABASE_UNAVAILABLE',
        message: 'O banco de dados esta indisponivel.',
      });
    }

    return {
      status: 'up',
      timestamp: new Date().toISOString(),
      database: 'up',
    };
  }
}
