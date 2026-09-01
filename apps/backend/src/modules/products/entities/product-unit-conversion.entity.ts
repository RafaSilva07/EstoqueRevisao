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
import { UserEntity } from '../../users/entities/user.entity';
import { ProductEntity } from './product.entity';

const numericTransformer: ValueTransformer = {
  to: (value: number): number => value,
  from: (value: string): number => Number(value),
};

@Entity({ name: 'product_unit_conversions' })
export class ProductUnitConversionEntity {
  @PrimaryColumn('uuid')
  id: string = randomUUID();

  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @ManyToOne(() => ProductEntity, (product) => product.unitConversions, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'product_id' })
  product!: ProductEntity;

  @Column({ name: 'from_unit', type: 'varchar', length: 20 })
  fromUnit!: string;

  @Column({ name: 'to_unit', type: 'varchar', length: 20 })
  toUnit!: string;

  @Column({ type: 'numeric', precision: 18, scale: 6, transformer: numericTransformer })
  factor!: number;

  @Column({ type: 'boolean', default: true })
  active = true;

  @Column({ name: 'created_by', type: 'uuid' })
  createdById!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by' })
  createdBy!: UserEntity;

  @Column({ name: 'updated_by', type: 'uuid' })
  updatedById!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'updated_by' })
  updatedBy!: UserEntity;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
