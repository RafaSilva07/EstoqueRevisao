import { Global, Module } from '@nestjs/common';
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
export class SystemLogsModule {}

