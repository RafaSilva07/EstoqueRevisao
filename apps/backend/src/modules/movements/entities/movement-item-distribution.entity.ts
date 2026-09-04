import { randomUUID } from 'node:crypto';
import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, ValueTransformer } from 'typeorm';
import { StockLocationEntity } from '../../stocks/entities/stock-location.entity';
import { MovementItemEntity } from './movement-item.entity';

const numericTransformer: ValueTransformer = {
  to: (value: number): number => value,
  from: (value: string): number => Number(value),
};

@Entity({ name: 'movement_item_distributions' })
export class MovementItemDistributionEntity {
  @PrimaryColumn('uuid')
  id: string = randomUUID();

  @Column({ name: 'movement_item_id', type: 'uuid' })
  movementItemId!: string;

  @ManyToOne(() => MovementItemEntity, (item) => item.distributions, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'movement_item_id' })
  movementItem!: MovementItemEntity;

  @Column({ name: 'destination_location_id', type: 'uuid' })
  destinationLocationId!: string;

  @ManyToOne(() => StockLocationEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'destination_location_id' })
  destinationLocation!: StockLocationEntity;

  @Column({ type: 'numeric', precision: 18, scale: 6, transformer: numericTransformer })
  quantity!: number;
}
