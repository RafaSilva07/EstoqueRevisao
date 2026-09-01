import { randomUUID } from 'node:crypto';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from '../../users/entities/user.entity';
import { BatchEntity } from '../../batches/entities/batch.entity';
import { ProductUnitConversionEntity } from './product-unit-conversion.entity';

@Entity({ name: 'products' })
export class ProductEntity {
  @PrimaryColumn('uuid')
  id: string = randomUUID();

  @Column({ type: 'varchar', length: 60 })
  code!: string;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ name: 'default_unit', type: 'varchar', length: 20 })
  defaultUnit!: string;

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

  @OneToMany(() => BatchEntity, (batch) => batch.product)
  batches!: BatchEntity[];

  @OneToMany(() => ProductUnitConversionEntity, (conversion) => conversion.product)
  unitConversions!: ProductUnitConversionEntity[];
}
