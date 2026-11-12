import { Global, Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemLogEntity } from './entities/system-log.entity';
import { SystemLogsRepository } from './system-logs.repository';
import { SystemLogsService } from './system-logs.service';
import { SystemLogsController } from './system-logs.controller';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([SystemLogEntity])],
  controllers: [SystemLogsController],
  providers: [SystemLogsRepository, SystemLogsService],
  exports: [SystemLogsRepository, SystemLogsService],
})
export class SystemLogsModule implements OnModuleInit {
  constructor(private readonly logsService: SystemLogsService) {}

  async onModuleInit(): Promise<void> {
    await this.logsService.info({
      context: 'SystemBootstrap',
      description: 'Módulo de observabilidade e monitoramento de logs inicializado.',
      details: { service: 'SystemLogsModule', status: 'ACTIVE' },
    }).catch(() => undefined);
  }
}

