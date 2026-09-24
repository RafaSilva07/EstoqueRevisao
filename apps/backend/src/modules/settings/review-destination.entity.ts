import { CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { StockLocationEntity } from '../stocks/entities/stock-location.entity';

@Entity('review_process_destinations')
export class ReviewDestinationEntity {
  @PrimaryColumn({ name: 'stock_location_id', type: 'uuid' })
  stockLocationId!: string;

  @ManyToOne(() => StockLocationEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'stock_location_id' })
  stockLocation!: StockLocationEntity;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

