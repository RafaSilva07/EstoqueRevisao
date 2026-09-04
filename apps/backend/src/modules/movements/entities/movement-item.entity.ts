import { randomUUID } from 'node:crypto';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryColumn, ValueTransformer } from 'typeorm';
import { BatchEntity } from '../../batches/entities/batch.entity';
import { ProductEntity } from '../../products/entities/product.entity';
import { MovementEntity } from './movement.entity';
import { MovementItemDistributionEntity } from './movement-item-distribution.entity';

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

  @ManyToOne(() => MovementEntity, (movement) => movement.items, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'movement_id' })
  movement!: MovementEntity;

  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @ManyToOne(() => ProductEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'product_id' })
  product!: ProductEntity;

  @Column({ name: 'batch_id', type: 'uuid' })
  batchId!: string;

  @ManyToOne(() => BatchEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'batch_id' })
  batch!: BatchEntity;

  @Column({ type: 'numeric', precision: 18, scale: 6, transformer: numericTransformer })
  quantity!: number;

  @OneToMany(() => MovementItemDistributionEntity, (distribution) => distribution.movementItem)
  distributions!: MovementItemDistributionEntity[];
}
