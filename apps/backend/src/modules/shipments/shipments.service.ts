import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, SelectQueryBuilder } from 'typeorm';
import { AuthenticatedUser } from '../auth/authenticated-user.interface';
import { AuditService } from '../audit/audit.service';
import { AuditRequestMetadata } from '../audit/audit.types';
import { OperationalLotsService } from '../batches/operational-lots.service';
import { BatchEntity } from '../batches/entities/batch.entity';
import { ProductEntity } from '../products/entities/product.entity';
import { StockLocationEntity } from '../stocks/entities/stock-location.entity';
import { StockPositionEntity } from '../stocks/entities/stock-position.entity';
import { StockLocationKind } from '../stocks/domain/stock-location-kind.enum';
import { StockPositionKey } from '../stocks/stock-positions.repository';
import { StockPositionsService } from '../stocks/stock-positions.service';
import { MovementsRepository } from '../movements/movements.repository';
import { MovementEntity } from '../movements/entities/movement.entity';
import { MovementItemEntity } from '../movements/entities/movement-item.entity';
import { MovementType } from '../movements/domain/movement-type.enum';
import { MovementStatus } from '../movements/domain/movement-status.enum';
import { PaginatedResult, paginate } from '../../shared/pagination/paginated-result.interface';
import { AvailableShipmentPositionsQueryDto, CreateShipmentDto, ExpirationConfirmationDto, ShipmentQueryDto } from './shipment.dto';
import { Sector, ShipmentEntity, ShipmentItemEntity, ShipmentStatus } from './shipment.entity';

@Injectable()
export class ShipmentsService {
  constructor(private readonly dataSource: DataSource, private readonly lots: OperationalLotsService,
    private readonly stock: StockPositionsService, private readonly movements: MovementsRepository,
    private readonly audit: AuditService) {}

  private sector(user: AuthenticatedUser): Sector {
    if (!['REVISAO','PRODUCAO','EXPEDICAO'].includes(user.sector ?? '')) throw new ForbiddenException('Usuário sem setor válido.');
    return user.sector as Sector;
  }

  private details(manager = this.dataSource.manager): SelectQueryBuilder<ShipmentEntity> {
    return manager.getRepository(ShipmentEntity).createQueryBuilder('shipment')
      .innerJoinAndSelect('shipment.createdBy', 'creator')
      .leftJoinAndSelect('shipment.decidedBy', 'decider')
      .leftJoinAndSelect('shipment.items', 'item')
      .leftJoinAndSelect('item.batch', 'batch')
      .leftJoinAndSelect('item.stockLocation', 'location');
  }

  async get(id: string, user: AuthenticatedUser, manager = this.dataSource.manager): Promise<ShipmentEntity> {
    const sector = this.sector(user);
    const shipment = await this.details(manager).where('shipment.id = :id', { id })
      .andWhere('(shipment.originSector = :sector OR shipment.destinationSector = :sector)', { sector }).getOne();
    if (!shipment) throw new NotFoundException('Envio não encontrado neste setor.');
    return shipment;
  }

  async list(query: ShipmentQueryDto, user: AuthenticatedUser): Promise<PaginatedResult<ShipmentEntity>> {
    const sector = this.sector(user);
    const builder = this.details().where('(shipment.originSector = :sector OR shipment.destinationSector = :sector)', { sector });
    if (query.view === 'pending') builder.andWhere('shipment.destinationSector = :sector AND shipment.status = :pending', { pending: 'AGUARDANDO_RECEBIMENTO' });
    if (query.view === 'sent' || query.view === 'updates') builder.andWhere('shipment.createdById = :userId', { userId: user.id });
    if (query.view === 'history' || query.view === 'updates') builder.andWhere('shipment.status <> :pending', { pending: 'AGUARDANDO_RECEBIMENTO' });
    const [items, total] = await builder.orderBy(query.view === 'updates' ? 'shipment.decidedAt' : 'shipment.createdAt','DESC').addOrderBy('shipment.id','DESC')
      .skip((query.page - 1) * query.limit).take(query.limit).getManyAndCount();
    return paginate(items, total, query.page, query.limit);
  }

  async availablePositions(
    query: AvailableShipmentPositionsQueryDto,
    user: AuthenticatedUser,
  ): Promise<PaginatedResult<StockPositionEntity>> {
    if (this.sector(user) !== 'REVISAO') {
      throw new ForbiddenException('Somente a Revisão consulta posições para envio externo.');
    }
    if (!query.batchCode && !query.manufacturingDate) {
      throw new BadRequestException('Informe o lote ou a data de fabricação.');
    }
    const builder = this.dataSource.getRepository(StockPositionEntity)
      .createQueryBuilder('position')
      .innerJoinAndSelect('position.product', 'product')
      .innerJoinAndSelect('position.batch', 'batch')
      .innerJoinAndSelect('position.stockLocation', 'stockLocation')
      .where('position.quantity > 0')
      .andWhere('position.productId = :productId', { productId: query.productId })
      .andWhere('product.active = true')
      .andWhere('stockLocation.active = true')
      .andWhere("stockLocation.kind <> 'EXTERNAL'");
    if (query.batchCode) {
      builder.andWhere('batch.code ILIKE :batchCode', { batchCode: `%${query.batchCode}%` });
    }
    if (query.manufacturingDate) {
      builder.andWhere('batch.manufacturingDate = :manufacturingDate', {
        manufacturingDate: query.manufacturingDate,
      });
    }
    const [items, total] = await builder
      .addSelect("CASE WHEN stockLocation.code = 'LATA_BOA' THEN 0 ELSE 1 END", 'location_priority')
      .orderBy('location_priority', 'ASC')
      .addOrderBy('stockLocation.name', 'ASC')
      .addOrderBy('batch.code', 'ASC')
      .addOrderBy('batch.expirationDate', 'ASC')
      .addOrderBy('position.id', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    return paginate(items, total, query.page, query.limit);
  }

  async create(dto: CreateShipmentDto, user: AuthenticatedUser, metadata: AuditRequestMetadata): Promise<ShipmentEntity> {
    const sector = this.sector(user);
    if ((sector === 'REVISAO') === (dto.destinationSector === 'REVISAO')) throw new BadRequestException('O envio deve ocorrer entre Revisão e Produção ou Expedição.');
    const id = await this.dataSource.transaction(async (manager) => {
      // Serializes retries before reserving stock or creating immutable lots.
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [dto.requestKey]);
      const existing = await manager.findOneBy(ShipmentEntity, { requestKey: dto.requestKey });
      if (existing) {
        if (existing.createdById !== user.id || existing.originSector !== sector) throw new ConflictException('Chave de envio já utilizada.');
        return existing.id;
      }
      const externalSector = sector === 'REVISAO' ? dto.destinationSector : sector;
      const external = await manager.findOneBy(StockLocationEntity, { sector: externalSector, active: true });
      const source = await manager.getRepository(StockLocationEntity).createQueryBuilder('location')
        .where("location.reviewRole = 'SOURCE' AND location.active = true").getOne();
      if (!external || !source) throw new ConflictException('Locais dos setores ou A Revisar não configurados/ativos.');
      const shipment = Object.assign(new ShipmentEntity(), {
        requestKey: dto.requestKey, originSector: sector, destinationSector: dto.destinationSector,
        createdById: user.id, originLocationId: sector === 'REVISAO' ? null : external.id,
        destinationLocationId: sector === 'REVISAO' ? external.id : source.id,
        observation: dto.observation?.trim() || null,
      });
      // Same product lock order as inline entries. Outgoing reservations lock locations before stock.
      const products = new Map<string, ProductEntity>();
      for (const productId of [...new Set(dto.items.map((item) => item.productId))].sort()) {
        const builder = manager.getRepository(ProductEntity).createQueryBuilder('product').where('product.id = :productId', { productId });
        if (sector !== 'REVISAO') builder.setLock('for_no_key_update');
        const product = await builder.getOne();
        if (!product?.active) throw new BadRequestException('Produto inexistente ou inativo.');
        products.set(productId, product);
      }
      if (sector === 'REVISAO') {
        for (const locationId of [...new Set(dto.items.map((item) => item.stockLocationId).filter((id): id is string => Boolean(id)))].sort()) {
          await manager.query('SELECT id FROM stock_locations WHERE id = $1 FOR NO KEY UPDATE', [locationId]);
        }
      }
      const items: ShipmentItemEntity[] = [];
      for (const input of dto.items) {
        let batch: BatchEntity | null;
        if (sector === 'REVISAO') {
          if (!input.batchId || !input.stockLocationId || input.lot) throw new BadRequestException('Selecione uma posição disponível, sem alterar o lote.');
          const location = await manager.findOneBy(StockLocationEntity, { id: input.stockLocationId });
          if (!location?.active || location.kind === StockLocationKind.External) throw new BadRequestException('Origem interna inválida.');
          batch = await manager.findOneBy(BatchEntity, { id: input.batchId, productId: input.productId });
        } else {
          if (input.stockLocationId || Boolean(input.batchId) === Boolean(input.lot)) throw new BadRequestException('Informe lote/fabricação e validade ou um lote existente.');
          batch = input.lot
            ? await this.lots.resolveInTransaction(input.productId, input.lot, user.id, dto.confirmedExpirationKeys ?? [], manager)
            : await this.lots.resolveExistingInTransaction(input.productId, input.batchId!, user.id, dto.confirmedExpirationKeys ?? [], manager);
        }
        if (!batch) throw new BadRequestException('Lote incompatível com o produto.');
        const product = products.get(input.productId)!;
        items.push(Object.assign(new ShipmentItemEntity(), {
          shipmentId: shipment.id, productId: product.id, batchId: batch.id,
          stockLocationId: input.stockLocationId ?? null, quantity: input.quantity,
          observation: input.observation?.trim() || null,
          productSnapshot: { code: product.code, name: product.name, defaultUnit: product.defaultUnit },
        }));
      }
      // Reject repeated positions to make the available balance check unambiguous.
      const keys = new Set<string>();
      for (const item of this.ordered(items)) {
        const key = `${item.productId}:${item.batchId}:${item.stockLocationId}`;
        if (sector === 'REVISAO' && keys.has(key)) throw new BadRequestException('A mesma posição não pode ser repetida no envio.');
        keys.add(key);
        if (sector === 'REVISAO') await this.stock.removeQuantity(this.stockKey(item), item.quantity, manager);
      }
      await manager.save(shipment);
      await manager.save(items);
      await this.record(shipment, user.id, 'SHIPMENT_CREATE', manager, metadata, { items, confirmedExpirationKeys: dto.confirmedExpirationKeys ?? [] });
      return shipment.id;
    });
    return this.get(id, user);
  }

  async decide(id: string, status: Exclude<ShipmentStatus, 'AGUARDANDO_RECEBIMENTO'>,
    reason: string | null, dto: ExpirationConfirmationDto, user: AuthenticatedUser, metadata: AuditRequestMetadata): Promise<ShipmentEntity> {
    const sector = this.sector(user);
    if (status === 'RECUSADO' && (!reason?.trim() || reason.trim().length > 1000)) throw new BadRequestException('Informe o motivo da recusa (até 1000 caracteres).');
    await this.dataSource.transaction(async (manager) => {
      const locked = await manager.getRepository(ShipmentEntity).createQueryBuilder('shipment')
        .where('shipment.id = :id', { id }).setLock('pessimistic_write').getOne();
      if (!locked) throw new NotFoundException('Envio não encontrado.');
      if (locked.destinationSector !== sector) throw new ForbiddenException('Somente o setor destinatário pode decidir o recebimento.');
      if (locked.status === status) return; // Replay never moves stock again.
      if (locked.status !== 'AGUARDANDO_RECEBIMENTO') throw new ConflictException('Este envio já foi concluído. Crie um novo envio para correções.');
      const shipment = await this.get(id, user, manager);
      const items = this.ordered(shipment.items);
      if (status === 'CONFIRMADO' && sector === 'REVISAO') {
        for (const productId of [...new Set(items.map((item) => item.productId))].sort()) {
          await manager.getRepository(ProductEntity).createQueryBuilder('product').where('product.id = :productId', { productId })
            .setLock('for_no_key_update').getOne();
        }
        for (const item of items) {
          await this.lots.resolveExistingInTransaction(item.productId, item.batchId, user.id, dto.confirmedExpirationKeys ?? [], manager);
          await this.stock.addQuantity({ productId: item.productId, batchId: item.batchId, stockLocationId: shipment.destinationLocationId }, item.quantity, manager);
        }
      }
      if (status === 'RECUSADO' && shipment.originSector === 'REVISAO') {
        for (const item of items) await this.stock.restoreQuantity(this.stockKey(item), item.quantity, manager);
      }
      shipment.status = status;
      shipment.decidedById = user.id;
      shipment.decidedAt = new Date();
      shipment.refusalReason = status === 'RECUSADO' ? reason!.trim() : null;
      if (status === 'CONFIRMADO') await this.recordMovements(shipment, manager, metadata);
      await manager.getRepository(ShipmentEntity).update(id, {
        status, decidedById: user.id, decidedAt: shipment.decidedAt, refusalReason: shipment.refusalReason,
      });
      await this.record(shipment, user.id, status === 'CONFIRMADO' ? 'SHIPMENT_CONFIRM' : 'SHIPMENT_REFUSE', manager, metadata,
        { previousStatus: 'AGUARDANDO_RECEBIMENTO', confirmedExpirationKeys: dto.confirmedExpirationKeys ?? [] });
    });
    return this.get(id, user);
  }

  private ordered(items: ShipmentItemEntity[]): ShipmentItemEntity[] {
    return [...items].sort((a,b) => `${a.productId}:${a.batchId}:${a.stockLocationId}`.localeCompare(`${b.productId}:${b.batchId}:${b.stockLocationId}`));
  }
  private stockKey(item: ShipmentItemEntity): StockPositionKey {
    return { productId: item.productId, batchId: item.batchId, stockLocationId: item.stockLocationId! };
  }
  private async recordMovements(shipment: ShipmentEntity, manager: EntityManager, metadata: AuditRequestMetadata): Promise<void> {
    const groups = new Map<string, ShipmentItemEntity[]>();
    for (const item of shipment.items) {
      const origin = shipment.originLocationId ?? item.stockLocationId!;
      groups.set(origin, [...(groups.get(origin) ?? []), item]);
    }
    // A single shipment can use several internal locations. Existing movement headers
    // have one origin, so retain that model and link one movement per source location.
    for (const [originLocationId, items] of groups) {
      const movement = Object.assign(new MovementEntity(), {
        shipmentId: shipment.id, requestKey: crypto.randomUUID(),
        type: shipment.destinationSector === 'REVISAO' ? MovementType.ExternalEntry : MovementType.ExternalExit,
        originLocationId, destinationLocationId: shipment.destinationLocationId,
        responsibleUserId: shipment.decidedById, occurredAt: shipment.decidedAt,
        status: MovementStatus.Effective,
        observation: shipment.observation ?? `Envio ${shipment.id} confirmado pelo destinatário.`,
      });
      await this.movements.save(movement, manager);
      await this.movements.saveItems(items.map((item) => Object.assign(new MovementItemEntity(), {
        movementId: movement.id, productId: item.productId, batchId: item.batchId,
        destinationBatchId: null, quantity: item.quantity, productSnapshot: item.productSnapshot,
      })), manager);
      await this.audit.record({ ...metadata, manager, userId: shipment.decidedById, action: 'SHIPMENT_MOVEMENT_CREATE', entityType: 'MOVEMENT',
        entityId: movement.id, result: 'SUCCESS', newValues: { shipmentId: shipment.id, type: movement.type, items } });
    }
  }
  private record(shipment: ShipmentEntity, userId: string, action: string, manager: EntityManager, metadata: AuditRequestMetadata, extra: Record<string, unknown>): ReturnType<AuditService['record']> {
    return this.audit.record({ ...metadata, manager, userId, action, entityType: 'SHIPMENT', entityId: shipment.id, result: 'SUCCESS',
      newValues: { originSector: shipment.originSector, destinationSector: shipment.destinationSector, observation: shipment.observation, status: shipment.status,
        decidedAt: shipment.decidedAt, refusalReason: shipment.refusalReason, ...extra } });
  }
}
