import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogEntity } from '../audit/entities/audit-log.entity';
import { MovementStatus } from '../movements/domain/movement-status.enum';
import { MovementEntity } from '../movements/entities/movement.entity';
import { ShipmentEntity, ShipmentItemEntity } from '../shipments/shipment.entity';
import { PcpMovementQueryDto } from './dto/pcp-movement-query.dto';
import { PcpExecutionStatus } from './domain/pcp-execution-status.enum';

@Injectable()
export class PcpMovementsRepository {
  constructor(
    @InjectRepository(MovementEntity) private readonly movements: Repository<MovementEntity>,
    @InjectRepository(AuditLogEntity) private readonly audits: Repository<AuditLogEntity>,
    @InjectRepository(ShipmentItemEntity) private readonly shipmentItems: Repository<ShipmentItemEntity>,
    @InjectRepository(ShipmentEntity) private readonly shipments: Repository<ShipmentEntity>,
  ) {}

  async findAndCount(query: PcpMovementQueryDto): Promise<[MovementEntity[], number]> {
    const builder = this.movements.createQueryBuilder('movement')
      .innerJoinAndSelect('movement.originLocation', 'origin')
      .leftJoinAndSelect('movement.destinationLocation', 'destination')
      .innerJoinAndSelect('movement.responsibleUser', 'responsible')
      .leftJoinAndSelect('movement.pcpExecutedByUser', 'pcpExecutedBy')
      .loadRelationCountAndMap('movement.itemCount', 'movement.items');

    if (query.dateFrom) builder.andWhere('movement.occurredAt >= :dateFrom', { dateFrom: query.dateFrom });
    if (query.dateTo) builder.andWhere('movement.occurredAt <= :dateTo', { dateTo: query.dateTo });
    if (query.operationalStatus) builder.andWhere('movement.status = :status', {
      status: query.operationalStatus === 'CONCLUIDA' ? MovementStatus.Effective : MovementStatus.Canceled,
    });
    if (query.pcpStatus) builder.andWhere('movement.pcpExecutionStatus = :pcpStatus', { pcpStatus: query.pcpStatus });
    if (query.pcpStatus === PcpExecutionStatus.Pending) builder.andWhere('movement.requiresPcpExecution = true');
    if (query.type) builder.andWhere('movement.type = :type', { type: query.type });
    if (query.originLocationId) builder.andWhere('movement.originLocationId = :originLocationId', { originLocationId: query.originLocationId });
    if (query.destinationLocationId) builder.andWhere(`(
      movement.destinationLocationId = :destinationLocationId OR EXISTS (
        SELECT 1 FROM movement_items pcp_item
        INNER JOIN movement_item_distributions pcp_distribution ON pcp_distribution.movement_item_id = pcp_item.id
        WHERE pcp_item.movement_id = movement.id AND pcp_distribution.destination_location_id = :destinationLocationId
      ))`, { destinationLocationId: query.destinationLocationId });
    if (query.search) builder.andWhere(`(movement.codigo_movimentacao = :publicCode OR EXISTS (
      SELECT 1 FROM movement_items searched_item
      INNER JOIN products searched_product ON searched_product.id IN (searched_item.product_id, searched_item.output_product_id)
      INNER JOIN batches searched_batch ON searched_batch.id IN (searched_item.batch_id, searched_item.destination_batch_id, searched_item.output_batch_id)
      WHERE searched_item.movement_id = movement.id AND (
        searched_product.code ILIKE :search OR searched_product.name ILIKE :search OR searched_batch.code ILIKE :search
      )))`, { search: `%${query.search}%`, publicCode: query.search.trim().toUpperCase() });

    const direction = query.sort === 'DESC' ? 'DESC' : 'ASC';
    const primary = query.sort === 'PCP_STATUS' ? 'movement.pcpExecutionStatus' : 'movement.occurredAt';
    return builder.orderBy(primary, direction)
      .addOrderBy('movement.occurredAt', direction)
      .addOrderBy('movement.id', direction)
      .skip((query.page - 1) * query.limit).take(query.limit).getManyAndCount();
  }

  findAuditHistory(movementId: string): Promise<AuditLogEntity[]> {
    return this.audits.createQueryBuilder('audit').leftJoinAndSelect('audit.user', 'user')
      .where('audit.entityType = :entityType AND audit.entityId = :movementId', { entityType: 'MOVEMENT', movementId })
      .orderBy('audit.createdAt', 'ASC').getMany();
  }

  findShipmentEvidence(shipmentId: string): Promise<ShipmentItemEntity[]> {
    return this.shipmentItems.createQueryBuilder('item').leftJoinAndSelect('item.batch', 'batch')
      .leftJoinAndSelect('item.additionalPhotos', 'additionalPhoto')
      .where('item.shipmentId = :shipmentId', { shipmentId }).orderBy('item.id', 'ASC').getMany();
  }

  findShipment(shipmentId: string): Promise<ShipmentEntity | null> {
    return this.shipments.createQueryBuilder('shipment')
      .innerJoinAndSelect('shipment.createdBy', 'createdBy')
      .leftJoinAndSelect('shipment.decidedBy', 'decidedBy')
      .where('shipment.id = :shipmentId', { shipmentId }).getOne();
  }
}
