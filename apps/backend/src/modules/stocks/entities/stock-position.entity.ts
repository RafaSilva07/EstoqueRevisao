import { randomUUID } from 'node:crypto';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
  ValueTransformer,
} from 'typeorm';
import { BatchEntity } from '../../batches/entities/batch.entity';
import { ProductEntity } from '../../products/entities/product.entity';
import { StockLocationEntity } from './stock-location.entity';

const numericTransformer: ValueTransformer = {
  to: (value: number): number => value,
  from: (value: string): number => Number(value),
};

@Entity({ name: 'stock_positions' })
export class StockPositionEntity {
  @PrimaryColumn('uuid')
  id: string = randomUUID();

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

  @Column({ name: 'stock_location_id', type: 'uuid' })
  stockLocationId!: string;

  @ManyToOne(() => StockLocationEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'stock_location_id' })
  stockLocation!: StockLocationEntity;

  @Column({ type: 'numeric', precision: 18, scale: 6, transformer: numericTransformer })
  quantity!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
