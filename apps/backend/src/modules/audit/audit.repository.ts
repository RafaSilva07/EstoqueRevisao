import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuditLogEntity } from './entities/audit-log.entity';

@Injectable()
export class AuditRepository {
  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly repository: Repository<AuditLogEntity>,
  ) {}

  save(log: AuditLogEntity, manager?: EntityManager): Promise<AuditLogEntity> {
    return (manager?.getRepository(AuditLogEntity) ?? this.repository).save(log);
  }
}
