import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { DataSource, EntityManager, In, SelectQueryBuilder } from 'typeorm';
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
import { AvailableShipmentPositionsQueryDto, CompleteSeparationDto, CreateShipmentDto, ExpirationConfirmationDto, SeparationDraftDto, ShipmentQueryDto } from './shipment.dto';
import { Sector, ShipmentEntity, ShipmentItemEntity, ShipmentSeparationDraftEntity } from './shipment.entity';
import { StoredImage, StorageService, UploadedImage } from '../storage/storage.service';
import { SettingsService } from '../settings/settings.service';
import { AuditLogEntity } from '../audit/entities/audit-log.entity';

@Injectable()
export class ShipmentsService {
  constructor(private readonly dataSource: DataSource, private readonly lots: OperationalLotsService,
    private readonly stock: StockPositionsService, private readonly movements: MovementsRepository,
    private readonly audit: AuditService, private readonly storage: StorageService,
    @Optional() private readonly settings?: SettingsService) {}

  private sector(user: AuthenticatedUser): Sector {
    if (!['REVISAO','PRODUCAO','EXPEDICAO'].includes(user.sector ?? '')) throw new ForbiddenException('Usuário sem setor válido.');
    return user.sector as Sector;
  }

  private details(manager = this.dataSource.manager): SelectQueryBuilder<ShipmentEntity> {
    return manager.getRepository(ShipmentEntity).createQueryBuilder('shipment')
      .leftJoinAndMapMany('shipment.movements', MovementEntity, 'linkedMovement', 'linkedMovement.shipmentId = shipment.id')
      .innerJoinAndSelect('shipment.createdBy', 'creator')
      .leftJoinAndSelect('shipment.decidedBy', 'decider')
      .leftJoinAndSelect('shipment.receivedBy', 'receiver')
      .leftJoinAndSelect('shipment.sourceShipment', 'sourceShipment')
      .leftJoinAndSelect('shipment.derivedShipments', 'derivedShipment')
      .leftJoinAndSelect('shipment.items', 'item')
      .leftJoinAndSelect('item.separationDraft', 'separationDraft')
      .leftJoinAndSelect('item.batch', 'batch')
      .leftJoinAndSelect('item.stockLocation', 'location');
  }

  async get(id: string, user: AuthenticatedUser, manager = this.dataSource.manager, processExpiration = true): Promise<ShipmentEntity> {
    if (processExpiration) await this.expireDueSeparations();
    const sector = this.sector(user);
    const shipment = await this.details(manager).where('shipment.id = :id', { id })
      .andWhere('(shipment.originSector = :sector OR shipment.destinationSector = :sector)', { sector }).getOne();
    if (!shipment) throw new NotFoundException('Envio não encontrado neste setor.');
    return shipment;
  }

  async list(query: ShipmentQueryDto, user: AuthenticatedUser): Promise<PaginatedResult<ShipmentEntity>> {
    await this.expireDueSeparations();
    const sector = this.sector(user);
    const builder = this.details().where('(shipment.originSector = :sector OR shipment.destinationSector = :sector)', { sector });
    if (query.view === 'pending') builder.andWhere("shipment.destinationSector = :sector AND shipment.status IN ('AGUARDANDO_RECEBIMENTO','EM_SEPARACAO')");
    if (query.view === 'open') builder.andWhere("shipment.status IN ('AGUARDANDO_RECEBIMENTO','EM_SEPARACAO')");
    if (query.view === 'sent' || query.view === 'updates') builder.andWhere('shipment.createdById = :userId', { userId: user.id });
    if (query.view === 'sent') builder.andWhere("shipment.status IN ('AGUARDANDO_RECEBIMENTO','EM_SEPARACAO')");
    if (query.view === 'history' || query.view === 'updates') builder.andWhere("shipment.status NOT IN ('AGUARDANDO_RECEBIMENTO','EM_SEPARACAO')");
    if (query.codigoMovimentacao) builder.andWhere('shipment.codigoMovimentacao = :publicCode', { publicCode: query.codigoMovimentacao.trim().toUpperCase() });
    if (query.status) builder.andWhere('shipment.status = :status', { status: query.status });
    const dateField = query.view === 'updates' ? 'shipment.decidedAt' : 'shipment.createdAt';
    const primary = query.sort === 'STATUS' ? 'shipment.status' : dateField;
    const direction = query.sort === 'OLDEST' || query.sort === 'STATUS' ? 'ASC' : 'DESC';
    const [items, total] = await builder.orderBy(primary, direction).addOrderBy(dateField, direction).addOrderBy('shipment.id', direction)
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

  async create(dto: CreateShipmentDto, files: UploadedImage[], user: AuthenticatedUser, metadata: AuditRequestMetadata): Promise<ShipmentEntity> {
    if (files.length !== dto.items.length) throw new BadRequestException('Adicione exatamente uma foto para cada produto do envio.');
    files.forEach((file) => this.storage.validateImage(file));
    const photos: StoredImage[] = [];
    try {
      for (const file of files) photos.push(await this.storage.saveImage(file));
      const result = await this.persist(dto, photos, user, metadata);
      if (!result.created) await Promise.allSettled(photos.map((photo) => this.storage.deleteImage(photo.key)));
      return this.get(result.id, user);
    } catch (error) {
      await Promise.allSettled(photos.map((photo) => this.storage.deleteImage(photo.key)));
      throw error;
    }
  }

  private async persist(dto: CreateShipmentDto, photos: StoredImage[], user: AuthenticatedUser, metadata: AuditRequestMetadata): Promise<{ id: string; created: boolean }> {
    const sector = this.sector(user);
    if ((sector === 'REVISAO') === (dto.destinationSector === 'REVISAO')) throw new BadRequestException('O envio deve ocorrer entre Revisão e Produção ou Expedição.');
    return this.dataSource.transaction(async (manager) => {
      // Serializes retries before reserving stock or creating immutable lots.
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [dto.requestKey]);
      const existing = await manager.findOneBy(ShipmentEntity, { requestKey: dto.requestKey });
      if (existing) {
        if (existing.createdById !== user.id || existing.originSector !== sector) throw new ConflictException('Chave de envio já utilizada.');
        return { id: existing.id, created: false };
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
      for (const [index, input] of dto.items.entries()) {
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
          photoStorageKey: photos[index].key, photoMimeType: photos[index].mimeType, photoSize: photos[index].size,
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
      await this.saveNewShipment(shipment, manager);
      await manager.save(items);
      await this.record(shipment, user.id, 'SHIPMENT_CREATE', manager, metadata, {
        items: items.map((item) => ({ productId: item.productId, batchId: item.batchId, stockLocationId: item.stockLocationId,
          quantity: item.quantity, observation: item.observation, productSnapshot: item.productSnapshot, photoAttached: true })),
        confirmedExpirationKeys: dto.confirmedExpirationKeys ?? [],
      });
      return { id: shipment.id, created: true };
    });
  }

  async photo(shipmentId: string, itemId: string, user: AuthenticatedUser): Promise<{ data: Buffer; mimeType: string }> {
    await this.get(shipmentId, user);
    const item = await this.dataSource.getRepository(ShipmentItemEntity).createQueryBuilder('item')
      .addSelect('item.photoStorageKey').where('item.id = :itemId AND item.shipmentId = :shipmentId', { itemId, shipmentId }).getOne();
    if (!item) throw new NotFoundException('Item do envio não encontrado.');
    if (!item.photoStorageKey || !item.photoMimeType) throw new NotFoundException('Este item histórico não possui foto.');
    return { data: await this.storage.readImage(item.photoStorageKey), mimeType: item.photoMimeType };
  }

  async decide(id: string, status: 'CONFIRMADO' | 'RECUSADO',
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
      const shipment = await this.get(id, user, manager, false);
      const items = this.ordered(shipment.items);
      if (status === 'CONFIRMADO' && dto.immediateSeparation) {
        if (sector !== 'REVISAO' || shipment.originSector !== 'EXPEDICAO' || shipment.shipmentKind !== 'NORMAL') {
          throw new BadRequestException('A separacao imediata esta disponivel apenas para recebimentos da Expedicao pela Revisao.');
        }
        for (const item of items) {
          await this.lots.resolveExistingInTransaction(item.productId, item.batchId, user.id, dto.confirmedExpirationKeys ?? [], manager);
        }
        const startedAt = new Date();
        if (!this.settings) throw new ConflictException('A configuracao da separacao imediata nao esta disponivel.');
        const minutes = await this.settings.separationMinutes(manager);
        const expiresAt = new Date(startedAt.getTime() + minutes * 60_000);
        shipment.status = 'EM_SEPARACAO';
        shipment.receivedById = user.id;
        shipment.receivedAt = startedAt;
        shipment.separationStartedAt = startedAt;
        shipment.separationExpiresAt = expiresAt;
        await manager.getRepository(ShipmentEntity).update(id, {
          status: 'EM_SEPARACAO', receivedById: user.id, receivedAt: startedAt,
          separationStartedAt: startedAt, separationExpiresAt: expiresAt,
        });
        await manager.save(items.map((item) => Object.assign(new ShipmentSeparationDraftEntity(), {
          shipmentItemId: item.id, returnQuantity: 0, updatedAt: startedAt,
        })));
        await this.record(shipment, user.id, 'SHIPMENT_SEPARATION_START', manager, metadata, {
          previousStatus: 'AGUARDANDO_RECEBIMENTO', separationStartedAt: startedAt, separationExpiresAt: expiresAt,
          capturedTimeoutMinutes: minutes,
        });
        return;
      }
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
      if (status === 'RECUSADO' && shipment.originSector === 'REVISAO' && shipment.shipmentKind !== 'RETORNO_IMEDIATO') {
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

  async cancel(id: string, reason: string, user: AuthenticatedUser, metadata: AuditRequestMetadata): Promise<ShipmentEntity> {
    const normalizedReason = reason.trim();
    if (!normalizedReason || normalizedReason.length > 1000) {
      throw new BadRequestException('Informe o motivo do cancelamento (até 1000 caracteres).');
    }
    await this.dataSource.transaction(async (manager) => {
      const locked = await manager.getRepository(ShipmentEntity).createQueryBuilder('shipment')
        .where('shipment.id = :id', { id }).setLock('pessimistic_write').getOne();
      if (!locked) throw new NotFoundException('Envio não encontrado.');
      if (locked.createdById !== user.id) throw new ForbiddenException('Somente o autor pode cancelar este envio.');
      if (locked.status !== 'AGUARDANDO_RECEBIMENTO') {
        throw new ConflictException('Somente envios ainda não recebidos podem ser cancelados.');
      }
      const shipment = await this.details(manager).where('shipment.id = :id', { id }).getOneOrFail();
      if (shipment.originSector === 'REVISAO' && shipment.shipmentKind !== 'RETORNO_IMEDIATO') {
        for (const item of this.ordered(shipment.items)) {
          await this.stock.restoreQuantity(this.stockKey(item), item.quantity, manager);
        }
      }
      const canceledAt = new Date();
      shipment.status = 'CANCELADO';
      shipment.decidedById = user.id;
      shipment.decidedAt = canceledAt;
      shipment.refusalReason = normalizedReason;
      await manager.getRepository(ShipmentEntity).update(id, {
        status: 'CANCELADO', decidedById: user.id, decidedAt: canceledAt, refusalReason: normalizedReason,
      });
      await this.record(shipment, user.id, 'SHIPMENT_CANCEL', manager, metadata, {
        previousStatus: 'AGUARDANDO_RECEBIMENTO', cancellationReason: normalizedReason, canceledAt,
      });
    });
    return this.get(id, user);
  }

  async auditHistory(id: string, user: AuthenticatedUser): Promise<AuditLogEntity[]> {
    if (!user.roles.includes('ADMIN')) throw new ForbiddenException('Somente administradores consultam a auditoria.');
    await this.get(id, user, this.dataSource.manager, false);
    return this.dataSource.getRepository(AuditLogEntity).createQueryBuilder('audit')
      .leftJoinAndSelect('audit.user', 'user')
      .where('audit.entityType = :entityType AND audit.entityId = :id', { entityType: 'SHIPMENT', id })
      .orderBy('audit.createdAt', 'ASC').addOrderBy('audit.id', 'ASC').getMany();
  }

  async saveSeparationDraft(id: string, dto: SeparationDraftDto, user: AuthenticatedUser,
    metadata: AuditRequestMetadata): Promise<ShipmentEntity> {
    await this.expireDueSeparations();
    const sector = this.sector(user);
    await this.dataSource.transaction(async (manager) => {
      const locked = await manager.getRepository(ShipmentEntity).createQueryBuilder('shipment')
        .where('shipment.id = :id', { id }).setLock('pessimistic_write').getOne();
      if (!locked) throw new NotFoundException('Envio nao encontrado.');
      if (sector !== 'REVISAO' || locked.destinationSector !== sector) throw new ForbiddenException('Somente a Revisao pode editar esta separacao.');
      if (locked.status !== 'EM_SEPARACAO') throw new ConflictException('A separacao nao esta mais disponivel.');
      const shipment = await this.details(manager).where('shipment.id = :id', { id }).getOneOrFail();
      const values = this.validateSeparationItems(shipment.items, dto);
      const now = new Date();
      await manager.save(values.map(({ item, returnQuantity }) => Object.assign(new ShipmentSeparationDraftEntity(), {
        shipmentItemId: item.id, returnQuantity, updatedAt: now,
      })));
      await this.record(shipment, user.id, 'SHIPMENT_SEPARATION_DRAFT_SAVE', manager, metadata, {
        items: values.map(({ item, returnQuantity }) => ({ shipmentItemId: item.id, returnQuantity })),
      });
    });
    return this.get(id, user);
  }

  async completeSeparation(id: string, dto: CompleteSeparationDto, files: UploadedImage[], user: AuthenticatedUser,
    metadata: AuditRequestMetadata): Promise<ShipmentEntity> {
    await this.expireDueSeparations();
    const positive = dto.items.filter((item) => item.returnQuantity > 0);
    if (files.length !== positive.length) throw new BadRequestException('Adicione uma foto para cada produto com retorno.');
    files.forEach((file) => this.storage.validateImage(file));
    const photos: StoredImage[] = [];
    let committed = false;
    let expiredDuringCompletion = false;
    try {
      for (const file of files) photos.push(await this.storage.saveImage(file));
      await this.dataSource.transaction(async (manager) => {
        const locked = await manager.getRepository(ShipmentEntity).createQueryBuilder('shipment')
          .where('shipment.id = :id', { id }).setLock('pessimistic_write').getOne();
        if (!locked) throw new NotFoundException('Envio nao encontrado.');
        if (this.sector(user) !== 'REVISAO' || locked.destinationSector !== 'REVISAO') throw new ForbiddenException('Somente a Revisao pode concluir esta separacao.');
        if (locked.status !== 'EM_SEPARACAO') throw new ConflictException('A separacao ja foi concluida ou expirou.');
        if (!locked.separationExpiresAt || locked.separationExpiresAt.getTime() <= Date.now()) {
          const expired = await this.details(manager).where('shipment.id = :id', { id }).getOneOrFail();
          await this.finalizeExpiredShipment(expired, manager, metadata);
          expiredDuringCompletion = true;
          return;
        }
        const shipment = await this.details(manager).where('shipment.id = :id', { id }).getOneOrFail();
        const values = this.validateSeparationItems(shipment.items, dto);
        const now = new Date();
        const netItems: ShipmentItemEntity[] = [];
        for (const { item, returnQuantity } of values) {
          const net = item.quantity - returnQuantity;
          if (net > 0) {
            await this.stock.addQuantity({ productId: item.productId, batchId: item.batchId, stockLocationId: shipment.destinationLocationId }, net, manager);
            netItems.push(Object.assign(new ShipmentItemEntity(), { ...item, quantity: net }));
          }
        }
        shipment.status = 'CONFIRMADO'; shipment.decidedById = user.id; shipment.decidedAt = now; shipment.separationCompletedAt = now;
        if (netItems.length) await this.recordMovements(Object.assign(new ShipmentEntity(), { ...shipment, items: netItems }), manager, metadata);

        if (positive.length) {
          const derived = Object.assign(new ShipmentEntity(), {
            requestKey: crypto.randomUUID(), originSector: 'REVISAO', destinationSector: 'EXPEDICAO',
            createdById: user.id, originLocationId: null, destinationLocationId: shipment.originLocationId!,
            observation: `Retorno imediato do recebimento ${shipment.id}.`, shipmentKind: 'RETORNO_IMEDIATO', sourceShipmentId: shipment.id,
          });
          await this.saveNewShipment(derived, manager);
          const byId = new Map(shipment.items.map((item) => [item.id, item]));
          let photoIndex = 0;
          const returnedItems = positive.map((input) => {
            const source = byId.get(input.shipmentItemId)!;
            const photo = photos[photoIndex++];
            return Object.assign(new ShipmentItemEntity(), {
              shipmentId: derived.id, productId: source.productId, batchId: source.batchId,
              stockLocationId: shipment.destinationLocationId, quantity: input.returnQuantity,
              observation: source.observation, productSnapshot: source.productSnapshot,
              photoStorageKey: photo.key, photoMimeType: photo.mimeType, photoSize: photo.size,
            });
          });
          await manager.save(returnedItems);
          await this.record(derived, user.id, 'SHIPMENT_IMMEDIATE_RETURN_CREATE', manager, metadata, {
            sourceShipmentId: shipment.id,
            items: returnedItems.map((item) => ({ productId: item.productId, batchId: item.batchId, quantity: item.quantity, photoAttached: true })),
          });
        }
        await manager.getRepository(ShipmentEntity).update(id, {
          status: 'CONFIRMADO', decidedById: user.id, decidedAt: now, separationCompletedAt: now,
        });
        await manager.delete(ShipmentSeparationDraftEntity, { shipmentItemId: In(shipment.items.map((item) => item.id)) });
        await this.record(shipment, user.id, 'SHIPMENT_SEPARATION_COMPLETE', manager, metadata, {
          items: values.map(({ item, returnQuantity }) => ({ shipmentItemId: item.id, receivedQuantity: item.quantity,
            returnQuantity, netQuantity: item.quantity - returnQuantity })),
        });
      });
      committed = true;
      if (expiredDuringCompletion) await Promise.allSettled(photos.map((photo) => this.storage.deleteImage(photo.key)));
      return this.get(id, user);
    } catch (error) {
      if (!committed) await Promise.allSettled(photos.map((photo) => this.storage.deleteImage(photo.key)));
      throw error;
    }
  }

  private validateSeparationItems(items: ShipmentItemEntity[], dto: SeparationDraftDto): Array<{ item: ShipmentItemEntity; returnQuantity: number }> {
    if (dto.items.length !== items.length) throw new BadRequestException('Informe o retorno de todos os itens recebidos.');
    const inputs = new Map(dto.items.map((item) => [item.shipmentItemId, item.returnQuantity]));
    if (inputs.size !== dto.items.length) throw new BadRequestException('Um item nao pode ser repetido na separacao.');
    return items.map((item) => {
      const returnQuantity = inputs.get(item.id);
      if (returnQuantity === undefined || !Number.isSafeInteger(returnQuantity) || returnQuantity < 0 || returnQuantity > item.quantity) {
        throw new BadRequestException('A quantidade de retorno deve ser inteira e nao pode superar o recebido.');
      }
      return { item, returnQuantity };
    });
  }

  private async saveNewShipment(shipment: ShipmentEntity, manager: EntityManager): Promise<void> {
    await manager.save(shipment);
    const persisted = await manager.findOneByOrFail(ShipmentEntity, { id: shipment.id });
    shipment.codigoMovimentacao = persisted.codigoMovimentacao;
  }

  private async expireDueSeparations(): Promise<void> {
    const due = await this.dataSource.getRepository(ShipmentEntity).createQueryBuilder('shipment').select('shipment.id', 'id')
      .where("shipment.status = 'EM_SEPARACAO' AND shipment.separationExpiresAt <= CURRENT_TIMESTAMP")
      .orderBy('shipment.separationExpiresAt', 'ASC').limit(100).getRawMany<{ id: string }>();
    for (const row of due) {
      await this.dataSource.transaction(async (manager) => {
        const locked = await manager.getRepository(ShipmentEntity).createQueryBuilder('shipment')
          .where('shipment.id = :id', { id: row.id }).setLock('pessimistic_write').getOne();
        if (!locked || locked.status !== 'EM_SEPARACAO' || !locked.separationExpiresAt || locked.separationExpiresAt.getTime() > Date.now()) return;
        const shipment = await this.details(manager).where('shipment.id = :id', { id: row.id }).getOneOrFail();
        await this.finalizeExpiredShipment(shipment, manager, { requestId: crypto.randomUUID(), ipAddress: null, userAgent: 'system:shipment-expiration' });
      });
    }
  }

  private async finalizeExpiredShipment(shipment: ShipmentEntity, manager: EntityManager, metadata: AuditRequestMetadata): Promise<void> {
    for (const item of this.ordered(shipment.items)) {
      await this.stock.addQuantity({ productId: item.productId, batchId: item.batchId, stockLocationId: shipment.destinationLocationId }, item.quantity, manager);
    }
    const now = new Date();
    shipment.status = 'CONFIRMADO'; shipment.decidedById = shipment.receivedById; shipment.decidedAt = now; shipment.separationCompletedAt = now;
    await this.recordMovements(shipment, manager, metadata);
    await manager.getRepository(ShipmentEntity).update(shipment.id, {
      status: 'CONFIRMADO', decidedById: shipment.receivedById, decidedAt: now, separationCompletedAt: now,
    });
    await manager.delete(ShipmentSeparationDraftEntity, { shipmentItemId: In(shipment.items.map((item) => item.id)) });
    await this.record(shipment, shipment.receivedById!, 'SHIPMENT_SEPARATION_EXPIRE', manager, metadata, { creditedFullQuantity: true });
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
        requiresPcpExecution: shipment.shipmentKind !== 'RETORNO_IMEDIATO',
        observation: shipment.observation ?? `Envio ${shipment.id} confirmado pelo destinatário.`,
      });
      await this.movements.save(movement, manager);
      await this.movements.saveItems(items.map((item) => Object.assign(new MovementItemEntity(), {
        movementId: movement.id, productId: item.productId, batchId: item.batchId,
        destinationBatchId: null, quantity: item.quantity, productSnapshot: item.productSnapshot,
      })), manager);
      await this.audit.record({ ...metadata, manager, userId: shipment.decidedById, action: 'SHIPMENT_MOVEMENT_CREATE', entityType: 'MOVEMENT',
        entityId: movement.id, result: 'SUCCESS', newValues: { codigoMovimentacao: movement.codigoMovimentacao, shipmentId: shipment.id, type: movement.type, items } });
    }
  }
  private record(shipment: ShipmentEntity, userId: string, action: string, manager: EntityManager, metadata: AuditRequestMetadata, extra: Record<string, unknown>): ReturnType<AuditService['record']> {
    return this.audit.record({ ...metadata, manager, userId, action, entityType: 'SHIPMENT', entityId: shipment.id, result: 'SUCCESS',
      newValues: { codigoMovimentacao: shipment.codigoMovimentacao, originSector: shipment.originSector, destinationSector: shipment.destinationSector, observation: shipment.observation, status: shipment.status,
        decidedAt: shipment.decidedAt, refusalReason: shipment.refusalReason, ...extra } });
  }
}
