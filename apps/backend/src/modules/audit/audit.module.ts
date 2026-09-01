import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditRepository } from './audit.repository';
import { AuditService } from './audit.service';
import { AuditLogEntity } from './entities/audit-log.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLogEntity])],
  providers: [AuditRepository, AuditService],
  exports: [AuditService],
})
export class AuditModule {}
