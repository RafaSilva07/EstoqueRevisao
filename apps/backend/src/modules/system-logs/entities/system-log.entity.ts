import { randomUUID } from 'node:crypto';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

export type SystemLogLevel = 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

@Entity({ name: 'system_logs' })
export class SystemLogEntity {
  @PrimaryColumn('uuid')
  id: string = randomUUID();

  @Index()
  @CreateDateColumn({ name: 'timestamp', type: 'timestamptz' })
  timestamp: Date = new Date();

  @Index()
  @Column({ type: 'varchar', length: 20 })
  level!: SystemLogLevel;

  @Index()
  @Column({ name: 'error_code', type: 'varchar', length: 100, nullable: true })
  errorCode!: string | null;

  @Index()
  @Column({ name: 'event_id', type: 'varchar', length: 100 })
  eventId!: string;

  @Column({ type: 'text' })
  description!: string;

  @Index()
  @Column({ type: 'varchar', length: 150 })
  context!: string;

  @Column({ type: 'jsonb', nullable: true })
  details!: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 50, default: 'development' })
  environment!: string;
}

