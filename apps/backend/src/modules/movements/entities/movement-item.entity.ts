import { randomUUID } from 'node:crypto';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryColumn, ValueTransformer } from 'typeorm';
import { BatchEntity } from '../../batches/entities/batch.entity';
import { ProductEntity } from '../../products/entities/product.entity';
import { MovementEntity } from './movement.entity';
import { MovementItemDistributionEntity } from './movement-item-distribution.entity';
import { PcpExecutionStatus } from '../../pcp/domain/pcp-execution-status.enum';
import { UserEntity } from '../../users/entities/user.entity';

const numericTransformer: ValueTransformer = {
  to: (value: number): number => value,
  from: (value: string): number => Number(value),
};

@Entity({ name: 'movement_items' })
export class MovementItemEntity {
  @PrimaryColumn('uuid')
  id: string = randomUUID();

  @Column({ name: 'movement_id', type: 'uuid' })
  movementId!: string;

  @Column({ name: 'record_ordinal', type: 'integer' })
  recordOrdinal!: number;

  @Column({ name: 'codigo_registro', type: 'varchar', length: 50, nullable: true, insert: false, update: false })
  codigoRegistro!: string | null;

  @Column({ name: 'shipment_item_id', type: 'uuid', nullable: true })
  shipmentItemId!: string | null;

  @Column({ name: 'pcp_execution_status', type: 'varchar', length: 20, default: PcpExecutionStatus.Pending })
  pcpExecutionStatus!: PcpExecutionStatus;

  @Column({ name: 'pcp_executed_by_user_id', type: 'uuid', nullable: true })
  pcpExecutedByUserId!: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'pcp_executed_by_user_id' })
  pcpExecutedByUser!: UserEntity | null;

  @Column({ name: 'pcp_executed_at', type: 'timestamptz', nullable: true })
  pcpExecutedAt!: Date | null;

  @Column({ name: 'pcp_execution_observation', type: 'varchar', length: 1000, nullable: true })
  pcpExecutionObservation!: string | null;

  @ManyToOne(() => MovementEntity, (movement) => movement.items, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'movement_id' })
  movement!: MovementEntity;

  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @ManyToOne(() => ProductEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'product_id' })
  product!: ProductEntity;

  @Column({ name: 'product_snapshot', type: 'jsonb', nullable: true })
  productSnapshot!: { code: string; name: string; defaultUnit: string } | null;

  @Column({ name: 'output_product_id', type: 'uuid', nullable: true })
  outputProductId!: string | null;

  @ManyToOne(() => ProductEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'output_product_id' })
  outputProduct!: ProductEntity | null;

  @Column({ name: 'output_batch_id', type: 'uuid', nullable: true })
  outputBatchId!: string | null;

  @ManyToOne(() => BatchEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'output_batch_id' })
  outputBatch!: BatchEntity | null;

  @Column({ name: 'output_quantity', type: 'numeric', precision: 18, scale: 6, nullable: true, transformer: { to: (value: number | null): number | null => value, from: (value: string | null): number | null => value === null ? null : Number(value) } })
  outputQuantity!: number | null;

  @Column({ name: 'units_per_package', type: 'integer', nullable: true })
  unitsPerPackage!: number | null;

  @Column({ name: 'output_product_snapshot', type: 'jsonb', nullable: true })
  outputProductSnapshot!: { code: string; name: string; defaultUnit: string } | null;

  @Column({ name: 'batch_id', type: 'uuid' })
  batchId!: string;

  @ManyToOne(() => BatchEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'batch_id' })
  batch!: BatchEntity;

  @Column({ name: 'destination_batch_id', type: 'uuid', nullable: true })
  destinationBatchId!: string | null;

  @ManyToOne(() => BatchEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'destination_batch_id' })
  destinationBatch!: BatchEntity | null;

  @Column({ type: 'numeric', precision: 18, scale: 6, transformer: numericTransformer })
  quantity!: number;

  @OneToMany(() => MovementItemDistributionEntity, (distribution) => distribution.movementItem)
  distributions!: MovementItemDistributionEntity[];
}
