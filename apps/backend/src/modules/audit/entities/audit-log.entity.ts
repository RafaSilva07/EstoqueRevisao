import { randomUUID } from 'node:crypto';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { UserEntity } from '../../users/entities/user.entity';

@Entity({ name: 'audit_logs' })
export class AuditLogEntity {
  @PrimaryColumn('uuid')
  id: string = randomUUID();

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity | null;

  @Column({ type: 'varchar', length: 100 })
  action!: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 100 })
  entityType!: string;

  @Column({ name: 'entity_id', type: 'varchar', length: 150, nullable: true })
  entityId!: string | null;

  @Column({ type: 'varchar', length: 30 })
  result!: string;

  @Column({ name: 'old_values', type: 'jsonb', nullable: true })
  oldValues!: Record<string, unknown> | null;

  @Column({ name: 'new_values', type: 'jsonb', nullable: true })
  newValues!: Record<string, unknown> | null;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress!: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 500, nullable: true })
  userAgent!: string | null;

  @Column({ name: 'request_id', type: 'uuid' })
  requestId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
