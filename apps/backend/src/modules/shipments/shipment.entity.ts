import { randomUUID } from 'node:crypto';
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, OneToOne, PrimaryColumn } from 'typeorm';
import { UserEntity } from '../users/entities/user.entity';
import { BatchEntity } from '../batches/entities/batch.entity';
import { StockLocationEntity } from '../stocks/entities/stock-location.entity';

export type Sector = 'REVISAO' | 'PRODUCAO' | 'EXPEDICAO';
export type ShipmentStatus = 'AGUARDANDO_RECEBIMENTO' | 'EM_SEPARACAO' | 'CONFIRMADO' | 'RECUSADO';

@Entity('shipments')
export class ShipmentEntity {
  @PrimaryColumn('uuid') id: string = randomUUID();
  @Column({ name: 'request_key', type: 'uuid' }) requestKey!: string;
  @Column({ name: 'origin_sector', type: 'varchar' }) originSector!: Sector;
  @Column({ name: 'destination_sector', type: 'varchar' }) destinationSector!: Sector;
  @Column({ name: 'created_by_id', type: 'uuid' }) createdById!: string;
  @ManyToOne(() => UserEntity) @JoinColumn({ name: 'created_by_id' }) createdBy!: UserEntity;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @Column({ name: 'origin_location_id', type: 'uuid', nullable: true }) originLocationId!: string | null;
  @Column({ name: 'destination_location_id', type: 'uuid' }) destinationLocationId!: string;
  @Column({ type: 'varchar', length: 1000, nullable: true }) observation!: string | null;
  @Column({ type: 'varchar' }) status: ShipmentStatus = 'AGUARDANDO_RECEBIMENTO';
  @Column({ name: 'shipment_kind', type: 'varchar', length: 30, default: 'NORMAL' }) shipmentKind: 'NORMAL' | 'RETORNO_IMEDIATO' = 'NORMAL';
  @Column({ name: 'source_shipment_id', type: 'uuid', nullable: true }) sourceShipmentId!: string | null;
  @ManyToOne(() => ShipmentEntity, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'source_shipment_id' }) sourceShipment!: ShipmentEntity | null;
  @OneToMany(() => ShipmentEntity, (shipment) => shipment.sourceShipment) derivedShipments!: ShipmentEntity[];
  @Column({ name: 'received_by_id', type: 'uuid', nullable: true }) receivedById!: string | null;
  @ManyToOne(() => UserEntity) @JoinColumn({ name: 'received_by_id' }) receivedBy!: UserEntity | null;
  @Column({ name: 'received_at', type: 'timestamptz', nullable: true }) receivedAt!: Date | null;
  @Column({ name: 'separation_started_at', type: 'timestamptz', nullable: true }) separationStartedAt!: Date | null;
  @Column({ name: 'separation_expires_at', type: 'timestamptz', nullable: true }) separationExpiresAt!: Date | null;
  @Column({ name: 'separation_completed_at', type: 'timestamptz', nullable: true }) separationCompletedAt!: Date | null;
  @Column({ name: 'decided_by_id', type: 'uuid', nullable: true }) decidedById!: string | null;
  @ManyToOne(() => UserEntity) @JoinColumn({ name: 'decided_by_id' }) decidedBy!: UserEntity | null;
  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true }) decidedAt!: Date | null;
  @Column({ name: 'refusal_reason', type: 'varchar', nullable: true }) refusalReason!: string | null;
  @OneToMany(() => ShipmentItemEntity, (item) => item.shipment) items!: ShipmentItemEntity[];
}

@Entity('shipment_items')
export class ShipmentItemEntity {
  @PrimaryColumn('uuid') id: string = randomUUID();
  @Column({ name: 'shipment_id', type: 'uuid' }) shipmentId!: string;
  @ManyToOne(() => ShipmentEntity, (shipment) => shipment.items) @JoinColumn({ name: 'shipment_id' }) shipment!: ShipmentEntity;
  @Column({ name: 'product_id', type: 'uuid' }) productId!: string;
  @Column({ name: 'batch_id', type: 'uuid' }) batchId!: string;
  @ManyToOne(() => BatchEntity) @JoinColumn({ name: 'batch_id' }) batch!: BatchEntity;
  @Column({ name: 'stock_location_id', type: 'uuid', nullable: true }) stockLocationId!: string | null;
  @ManyToOne(() => StockLocationEntity) @JoinColumn({ name: 'stock_location_id' }) stockLocation!: StockLocationEntity | null;
  @Column({ type: 'numeric', precision: 18, scale: 6, transformer: { to: (value: number) => value, from: (value: string) => Number(value) } }) quantity!: number;
  @Column({ type: 'varchar', length: 1000, nullable: true }) observation!: string | null;
  @Column({ name: 'photo_storage_key', type: 'varchar', length: 300, nullable: true, select: false }) photoStorageKey!: string | null;
  @Column({ name: 'photo_mime_type', type: 'varchar', length: 30, nullable: true }) photoMimeType!: string | null;
  @Column({ name: 'photo_size', type: 'integer', nullable: true }) photoSize!: number | null;
  @Column({ name: 'product_snapshot', type: 'jsonb' }) productSnapshot!: { code: string; name: string; defaultUnit: string };
  @OneToOne(() => ShipmentSeparationDraftEntity, (draft) => draft.shipmentItem) separationDraft!: unknown;
}

@Entity('shipment_separation_drafts')
export class ShipmentSeparationDraftEntity {
  @PrimaryColumn({ name: 'shipment_item_id', type: 'uuid' }) shipmentItemId!: string;
  @OneToOne(() => ShipmentItemEntity, (item) => item.separationDraft, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'shipment_item_id' }) shipmentItem!: ShipmentItemEntity;
  @Column({ name: 'return_quantity', type: 'numeric', precision: 18, scale: 6, transformer: { to: (value: number) => value, from: (value: string) => Number(value) } }) returnQuantity = 0;
  @Column({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
