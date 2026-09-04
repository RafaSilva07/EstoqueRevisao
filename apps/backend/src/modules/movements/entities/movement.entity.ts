import { randomUUID } from 'node:crypto';
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryColumn } from 'typeorm';
import { StockLocationEntity } from '../../stocks/entities/stock-location.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { MovementStatus } from '../domain/movement-status.enum';
import { MovementType } from '../domain/movement-type.enum';
import { MovementItemEntity } from './movement-item.entity';

@Entity({ name: 'movements' })
export class MovementEntity {
  @PrimaryColumn('uuid')
  id: string = randomUUID();

  @Column({ name: 'request_key', type: 'uuid', unique: true })
  requestKey!: string;

  @Column({ type: 'varchar', length: 40 })
  type!: MovementType;

  @Column({ name: 'origin_location_id', type: 'uuid' })
  originLocationId!: string;

  @ManyToOne(() => StockLocationEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'origin_location_id' })
  originLocation!: StockLocationEntity;

  @Column({ name: 'destination_location_id', type: 'uuid', nullable: true })
  destinationLocationId!: string | null;

  @ManyToOne(() => StockLocationEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'destination_location_id' })
  destinationLocation!: StockLocationEntity | null;

  @Column({ name: 'responsible_user_id', type: 'uuid' })
  responsibleUserId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'responsible_user_id' })
  responsibleUser!: UserEntity;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;

  @Column({ type: 'varchar', length: 30 })
  status!: MovementStatus;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  observation!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @OneToMany(() => MovementItemEntity, (item) => item.movement)
  items!: MovementItemEntity[];
}
