import { randomUUID } from 'node:crypto';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ProductEntity } from '../../products/entities/product.entity';
import { UserEntity } from '../../users/entities/user.entity';

@Entity({ name: 'batches' })
export class BatchEntity {
  @PrimaryColumn('uuid')
  id: string = randomUUID();

  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @ManyToOne(() => ProductEntity, (product) => product.batches, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'product_id' })
  product!: ProductEntity;

  @Column({ type: 'varchar', length: 6 })
  code!: string;

  @Column({ name: 'manufacturing_date', type: 'date' })
  manufacturingDate!: string;

  @Column({ name: 'expiration_date', type: 'date' })
  expirationDate!: string;

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
