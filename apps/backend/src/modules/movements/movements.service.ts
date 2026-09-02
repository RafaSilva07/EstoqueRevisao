import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { getPostgresError } from '../../shared/database/postgres-error';
import { paginate, PaginatedResult } from '../../shared/pagination/paginated-result.interface';
import { AuditService } from '../audit/audit.service';
import { AuditRequestMetadata } from '../audit/audit.types';
import { StockLocationKind } from '../stocks/domain/stock-location-kind.enum';
import { StockLocationsRepository } from '../stocks/stock-locations.repository';
import { StockPositionsService } from '../stocks/stock-positions.service';
import { MovementStatus } from './domain/movement-status.enum';
import { MovementType } from './domain/movement-type.enum';
import { CreateExternalMovementDto } from './dto/create-external-movement.dto';
import { MovementQueryDto } from './dto/movement-query.dto';
import { MovementItemEntity } from './entities/movement-item.entity';
import { MovementEntity } from './entities/movement.entity';
import { MovementsRepository } from './movements.repository';

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
    item: CreateExternalMovementDto['items'][number],
    dto: CreateExternalMovementDto,
    manager: EntityManager,
  ) => Promise<unknown>;
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
    dto: CreateExternalMovementDto,
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
    dto: CreateExternalMovementDto,
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
      applyStock: (service, item, movement, manager) => service.removeQuantity({
        productId: item.productId,
        batchId: item.batchId,
        stockLocationId: movement.originLocationId,
      }, item.quantity, manager),
    });
  }

  private async createEffectiveMovement(
    dto: CreateExternalMovementDto,
    userId: string,
    metadata: AuditRequestMetadata,
    rules: EffectiveMovementRules,
  ): Promise<MovementEntity> {
    const existing = await this.repository.findByRequestKey(dto.requestKey);
    if (existing) return this.resolveIdempotent(existing, userId, rules.type);
    if (rules.rejectDuplicateItems) this.validateNoDuplicateItems(dto);

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

        const items: MovementItemEntity[] = [];
        for (const dtoItem of dto.items) {
          await rules.applyStock(this.stockPositions, dtoItem, dto, manager);
          items.push(Object.assign(new MovementItemEntity(), {
            movementId: movement.id,
            productId: dtoItem.productId,
            batchId: dtoItem.batchId,
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
            items: dto.items,
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

  private validateNoDuplicateItems(dto: CreateExternalMovementDto): void {
    const keys = new Set<string>();
    for (const item of dto.items) {
      const key = `${item.productId}:${item.batchId}`;
      if (keys.has(key)) {
        throw new BadRequestException({
          code: 'DUPLICATE_MOVEMENT_ITEM',
          message: 'O mesmo produto e lote nao pode aparecer duas vezes na mesma saida.',
        });
      }
      keys.add(key);
    }
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
