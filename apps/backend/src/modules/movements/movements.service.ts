import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { getPostgresError } from '../../shared/database/postgres-error';
import { paginate, PaginatedResult } from '../../shared/pagination/paginated-result.interface';
import { AuditService } from '../audit/audit.service';
import { AuditRequestMetadata } from '../audit/audit.types';
import { StockLocationKind } from '../stocks/domain/stock-location-kind.enum';
import { ReviewLocationRole } from '../stocks/domain/review-location-role.enum';
import { StockLocationsRepository } from '../stocks/stock-locations.repository';
import { StockPositionsService } from '../stocks/stock-positions.service';
import { MovementStatus } from './domain/movement-status.enum';
import { MovementType } from './domain/movement-type.enum';
import { CreateEffectiveMovementDto } from './dto/create-effective-movement.dto';
import { CreateInternalTransferDto } from './dto/create-internal-transfer.dto';
import { CreateReviewDto } from './dto/create-review.dto';
import { MovementQueryDto } from './dto/movement-query.dto';
import { MovementItemEntity } from './entities/movement-item.entity';
import { MovementItemDistributionEntity } from './entities/movement-item-distribution.entity';
import { MovementEntity } from './entities/movement.entity';
import { MovementsRepository } from './movements.repository';

type EffectiveMovementItem = CreateEffectiveMovementDto['items'][number] & {
  destinationBatchId?: string;
};

type EffectiveMovementDto = Omit<CreateEffectiveMovementDto, 'items'> & {
  items: EffectiveMovementItem[];
};

interface EffectiveMovementRules {
  type: MovementType;
  auditAction: string;
  invalidOrigin: { code: string; message: string };
  invalidDestination: { code: string; message: string };
  originIsValid: (kind: StockLocationKind) => boolean;
  destinationIsValid: (kind: StockLocationKind) => boolean;
  rejectDuplicateItems: boolean;
  applyStock: (
    service: StockPositionsService,
    item: EffectiveMovementItem,
    dto: EffectiveMovementDto,
    manager: EntityManager,
  ) => Promise<unknown>;
  validateRoute?: (dto: EffectiveMovementDto) => void;
  deterministicItemOrder?: boolean;
}

@Injectable()
export class MovementsService {
  constructor(
    private readonly repository: MovementsRepository,
    private readonly locations: StockLocationsRepository,
    private readonly stockPositions: StockPositionsService,
    private readonly audit: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  async list(query: MovementQueryDto): Promise<PaginatedResult<MovementEntity>> {
    const [items, total] = await this.repository.findAndCount(query);
    return paginate(items, total, query.page, query.limit);
  }

  async getById(id: string): Promise<MovementEntity> {
    const movement = await this.repository.findById(id);
    if (!movement) {
      throw new NotFoundException({
        code: 'MOVEMENT_NOT_FOUND',
        message: 'Movimentacao nao encontrada.',
      });
    }
    return movement;
  }

  createExternalEntry(
    dto: CreateEffectiveMovementDto,
    userId: string,
    metadata: AuditRequestMetadata,
  ): Promise<MovementEntity> {
    return this.createEffectiveMovement(dto, userId, metadata, {
      type: MovementType.ExternalEntry,
      auditAction: 'EXTERNAL_ENTRY_CREATE',
      invalidOrigin: {
        code: 'INVALID_EXTERNAL_ORIGIN',
        message: 'A origem deve ser um local externo ativo.',
      },
      invalidDestination: {
        code: 'INVALID_STOCK_DESTINATION',
        message: 'O destino deve ser um estoque ou subestoque ativo.',
      },
      originIsValid: (kind) => kind === StockLocationKind.External,
      destinationIsValid: (kind) => kind !== StockLocationKind.External,
      rejectDuplicateItems: false,
      applyStock: (service, item, movement, manager) => service.addQuantity({
        productId: item.productId,
        batchId: item.batchId,
        stockLocationId: movement.destinationLocationId,
      }, item.quantity, manager),
    });
  }

  createExternalExit(
    dto: CreateEffectiveMovementDto,
    userId: string,
    metadata: AuditRequestMetadata,
  ): Promise<MovementEntity> {
    return this.createEffectiveMovement(dto, userId, metadata, {
      type: MovementType.ExternalExit,
      auditAction: 'EXTERNAL_EXIT_CREATE',
      invalidOrigin: {
        code: 'INVALID_STOCK_ORIGIN',
        message: 'A origem deve ser um estoque ou subestoque ativo.',
      },
      invalidDestination: {
        code: 'INVALID_EXTERNAL_DESTINATION',
        message: 'O destino deve ser um local externo ativo.',
      },
      originIsValid: (kind) => kind !== StockLocationKind.External,
      destinationIsValid: (kind) => kind === StockLocationKind.External,
      rejectDuplicateItems: true,
      deterministicItemOrder: true,
      applyStock: (service, item, movement, manager) => service.removeQuantity({
        productId: item.productId,
        batchId: item.batchId,
        stockLocationId: movement.originLocationId,
      }, item.quantity, manager),
    });
  }

  createInternalTransfer(
    dto: CreateInternalTransferDto,
    userId: string,
    metadata: AuditRequestMetadata,
  ): Promise<MovementEntity> {
    return this.createEffectiveMovement(dto, userId, metadata, {
      type: MovementType.InternalTransfer,
      auditAction: 'INTERNAL_TRANSFER_CREATE',
      invalidOrigin: {
        code: 'INVALID_INTERNAL_ORIGIN',
        message: 'A origem deve ser um estoque ou subestoque ativo.',
      },
      invalidDestination: {
        code: 'INVALID_INTERNAL_DESTINATION',
        message: 'O destino deve ser um estoque ou subestoque ativo.',
      },
      originIsValid: (kind) => kind !== StockLocationKind.External,
      destinationIsValid: (kind) => kind !== StockLocationKind.External,
      rejectDuplicateItems: true,
      deterministicItemOrder: true,
      validateRoute: (movement) => {
        for (const item of movement.items) {
          if (!item.destinationBatchId) {
            throw new BadRequestException({
              code: 'TRANSFER_DESTINATION_BATCH_REQUIRED',
              message: 'Informe o lote de destino de todos os itens.',
            });
          }
          if (
            movement.originLocationId === movement.destinationLocationId
            && item.batchId === item.destinationBatchId
          ) {
            throw new BadRequestException({
              code: 'TRANSFER_WITHOUT_CHANGE',
              message: 'A transferencia deve alterar o lote ou o local.',
            });
          }
        }
      },
      applyStock: (service, item, movement, manager) => service.transferQuantity({
        productId: item.productId,
        batchId: item.batchId,
        stockLocationId: movement.originLocationId,
      }, {
        productId: item.productId,
        batchId: item.destinationBatchId!,
        stockLocationId: movement.destinationLocationId,
      }, item.quantity, manager),
    });
  }

  async createReview(
    dto: CreateReviewDto,
    userId: string,
    metadata: AuditRequestMetadata,
  ): Promise<MovementEntity> {
    const existing = await this.repository.findByRequestKey(dto.requestKey);
    if (existing) return this.resolveIdempotent(existing, userId, MovementType.Review);
    this.validateReview(dto);

    try {
      const id = await this.dataSource.transaction(async (manager) => {
        const sources = await this.locations.findByReviewRole(ReviewLocationRole.Source, manager);
        const destinations = await this.locations.findByReviewRole(
          ReviewLocationRole.Destination,
          manager,
        );
        if (sources.length !== 1 || destinations.length === 0) {
          throw new ConflictException({
            code: 'REVIEW_CONFIGURATION_INVALID',
            message: 'A origem e os destinos da revisao nao estao configurados corretamente.',
          });
        }
        const source = sources[0];
        const allowedDestinationIds = new Set(destinations.map((location) => location.id));
        for (const item of dto.items) {
          if (item.distributions.some((distribution) => (
            !allowedDestinationIds.has(distribution.destinationLocationId)
          ))) {
            throw new BadRequestException({
              code: 'INVALID_REVIEW_DESTINATION',
              message: 'A revisao possui um destino interno nao permitido.',
            });
          }
        }

        const movement = Object.assign(new MovementEntity(), {
          requestKey: dto.requestKey,
          type: MovementType.Review,
          originLocationId: source.id,
          destinationLocationId: null,
          responsibleUserId: userId,
          occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
          status: MovementStatus.Effective,
          observation: dto.observation || null,
        });
        await this.repository.save(movement, manager);

        const effectiveItems = [...dto.items].sort((left, right) => (
          `${left.productId}:${left.batchId}`.localeCompare(`${right.productId}:${right.batchId}`)
        ));
        const items: MovementItemEntity[] = [];
        const distributions: MovementItemDistributionEntity[] = [];
        for (const dtoItem of effectiveItems) {
          await this.stockPositions.distributeQuantity({
            productId: dtoItem.productId,
            batchId: dtoItem.batchId,
            stockLocationId: source.id,
          }, dtoItem.distributions, dtoItem.quantity, manager);
          const item = Object.assign(new MovementItemEntity(), {
            movementId: movement.id,
            productId: dtoItem.productId,
            batchId: dtoItem.batchId,
            destinationBatchId: null,
            quantity: dtoItem.quantity,
          });
          items.push(item);
          for (const distribution of dtoItem.distributions) {
            distributions.push(Object.assign(new MovementItemDistributionEntity(), {
              movementItemId: item.id,
              destinationLocationId: distribution.destinationLocationId,
              quantity: distribution.quantity,
            }));
          }
        }
        await this.repository.saveItems(items, manager);
        await this.repository.saveDistributions(distributions, manager);
        await this.audit.record({
          ...metadata,
          manager,
          userId,
          action: 'REVIEW_CREATE',
          entityType: 'MOVEMENT',
          entityId: movement.id,
          result: 'SUCCESS',
          newValues: {
            type: movement.type,
            status: movement.status,
            originLocationId: movement.originLocationId,
            occurredAt: movement.occurredAt.toISOString(),
            observation: movement.observation,
            items: effectiveItems,
          },
        });
        return movement.id;
      });
      return this.getById(id);
    } catch (error: unknown) {
      if (getPostgresError(error)?.constraint === 'UQ_movements_request_key') {
        const concurrent = await this.repository.findByRequestKey(dto.requestKey);
        if (concurrent) return this.resolveIdempotent(concurrent, userId, MovementType.Review);
        throw this.duplicateRequest();
      }
      throw error;
    }
  }

  private async createEffectiveMovement(
    dto: EffectiveMovementDto,
    userId: string,
    metadata: AuditRequestMetadata,
    rules: EffectiveMovementRules,
  ): Promise<MovementEntity> {
    const existing = await this.repository.findByRequestKey(dto.requestKey);
    if (existing) return this.resolveIdempotent(existing, userId, rules.type);
    if (rules.rejectDuplicateItems) this.validateNoDuplicateItems(dto);
    rules.validateRoute?.(dto);

    try {
      const id = await this.dataSource.transaction(async (manager) => {
        const [origin, destination] = await Promise.all([
          this.locations.findById(dto.originLocationId, manager),
          this.locations.findById(dto.destinationLocationId, manager),
        ]);
        if (!origin?.active || !rules.originIsValid(origin.kind)) {
          throw new BadRequestException(rules.invalidOrigin);
        }
        if (!destination?.active || !rules.destinationIsValid(destination.kind)) {
          throw new BadRequestException(rules.invalidDestination);
        }

        const movement = Object.assign(new MovementEntity(), {
          requestKey: dto.requestKey,
          type: rules.type,
          originLocationId: dto.originLocationId,
          destinationLocationId: dto.destinationLocationId,
          responsibleUserId: userId,
          occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
          status: MovementStatus.Effective,
          observation: dto.observation || null,
        });
        await this.repository.save(movement, manager);

        const effectiveItems = rules.deterministicItemOrder
          ? [...dto.items].sort((left, right) => (
            `${left.productId}:${left.batchId}:${left.destinationBatchId ?? ''}`
              .localeCompare(`${right.productId}:${right.batchId}:${right.destinationBatchId ?? ''}`)
          ))
          : dto.items;
        const items: MovementItemEntity[] = [];
        for (const dtoItem of effectiveItems) {
          await rules.applyStock(this.stockPositions, dtoItem, dto, manager);
          items.push(Object.assign(new MovementItemEntity(), {
            movementId: movement.id,
            productId: dtoItem.productId,
            batchId: dtoItem.batchId,
            destinationBatchId: rules.type === MovementType.InternalTransfer
              ? dtoItem.destinationBatchId
              : null,
            quantity: dtoItem.quantity,
          }));
        }
        await this.repository.saveItems(items, manager);
        await this.audit.record({
          ...metadata,
          manager,
          userId,
          action: rules.auditAction,
          entityType: 'MOVEMENT',
          entityId: movement.id,
          result: 'SUCCESS',
          newValues: {
            type: movement.type,
            status: movement.status,
            originLocationId: movement.originLocationId,
            destinationLocationId: movement.destinationLocationId,
            occurredAt: movement.occurredAt.toISOString(),
            observation: movement.observation,
            items: effectiveItems,
          },
        });
        return movement.id;
      });
      return this.getById(id);
    } catch (error: unknown) {
      if (getPostgresError(error)?.constraint === 'UQ_movements_request_key') {
        const concurrent = await this.repository.findByRequestKey(dto.requestKey);
        if (concurrent) return this.resolveIdempotent(concurrent, userId, rules.type);
        throw this.duplicateRequest();
      }
      throw error;
    }
  }

  private validateNoDuplicateItems(dto: EffectiveMovementDto): void {
    const keys = new Set<string>();
    for (const item of dto.items) {
      const key = `${item.productId}:${item.batchId}`;
      if (keys.has(key)) {
        throw new BadRequestException({
          code: 'DUPLICATE_MOVEMENT_ITEM',
          message: 'O mesmo produto e lote nao pode aparecer duas vezes na mesma movimentacao.',
        });
      }
      keys.add(key);
    }
  }

  private validateReview(dto: CreateReviewDto): void {
    const itemKeys = new Set<string>();
    for (const item of dto.items) {
      const itemKey = `${item.productId}:${item.batchId}`;
      if (itemKeys.has(itemKey)) {
        throw new BadRequestException({
          code: 'DUPLICATE_REVIEW_ITEM',
          message: 'O mesmo produto e lote nao pode aparecer duas vezes na revisao.',
        });
      }
      itemKeys.add(itemKey);

      const destinationIds = new Set<string>();
      let distributedUnits = 0;
      for (const distribution of item.distributions) {
        if (destinationIds.has(distribution.destinationLocationId)) {
          throw new BadRequestException({
            code: 'DUPLICATE_REVIEW_DESTINATION',
            message: 'Um destino nao pode se repetir na distribuicao do mesmo item.',
          });
        }
        destinationIds.add(distribution.destinationLocationId);
        distributedUnits += this.toQuantityUnits(distribution.quantity);
      }
      if (distributedUnits !== this.toQuantityUnits(item.quantity)) {
        throw new BadRequestException({
          code: 'INVALID_REVIEW_DISTRIBUTION_TOTAL',
          message: 'A soma dos destinos deve ser exatamente igual a quantidade revisada.',
        });
      }
    }
  }

  private toQuantityUnits(quantity: number): number {
    return Math.round(quantity * 1_000_000);
  }

  private resolveIdempotent(
    movement: MovementEntity,
    userId: string,
    expectedType: MovementType,
  ): MovementEntity {
    if (movement.responsibleUserId === userId && movement.type === expectedType) return movement;
    throw this.duplicateRequest();
  }

  private duplicateRequest(): ConflictException {
    return new ConflictException({
      code: 'DUPLICATE_MOVEMENT_REQUEST',
      message: 'A chave desta movimentacao ja foi utilizada.',
    });
  }
}
