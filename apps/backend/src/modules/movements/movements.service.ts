import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { getPostgresError } from '../../shared/database/postgres-error';
import { paginate, PaginatedResult } from '../../shared/pagination/paginated-result.interface';
import { AuditService } from '../audit/audit.service';
import { AuditRequestMetadata } from '../audit/audit.types';
import { StockLocationKind } from '../stocks/domain/stock-location-kind.enum';
import { StockLocationsRepository } from '../stocks/stock-locations.repository';
import { StockPositionsService } from '../stocks/stock-positions.service';
import { MovementStatus } from './domain/movement-status.enum';
import { MovementType } from './domain/movement-type.enum';
import { CreateExternalEntryDto } from './dto/create-external-entry.dto';
import { MovementQueryDto } from './dto/movement-query.dto';
import { MovementItemEntity } from './entities/movement-item.entity';
import { MovementEntity } from './entities/movement.entity';
import { MovementsRepository } from './movements.repository';

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
    if (!movement) throw new NotFoundException({ code: 'MOVEMENT_NOT_FOUND', message: 'Movimentacao nao encontrada.' });
    return movement;
  }

  async createExternalEntry(dto: CreateExternalEntryDto, userId: string, metadata: AuditRequestMetadata): Promise<MovementEntity> {
    const existing = await this.repository.findByRequestKey(dto.requestKey);
    if (existing) {
      if (existing.responsibleUserId === userId) return existing;
      throw new ConflictException({ code: 'DUPLICATE_MOVEMENT_REQUEST', message: 'A chave desta entrada ja foi utilizada.' });
    }

    try {
      const id = await this.dataSource.transaction(async (manager) => {
        const [origin, destination] = await Promise.all([
          this.locations.findById(dto.originLocationId, manager),
          this.locations.findById(dto.destinationLocationId, manager),
        ]);
        if (!origin?.active || origin.kind !== StockLocationKind.External) {
          throw new BadRequestException({ code: 'INVALID_EXTERNAL_ORIGIN', message: 'A origem deve ser um local externo ativo.' });
        }
        if (!destination?.active || destination.kind === StockLocationKind.External) {
          throw new BadRequestException({ code: 'INVALID_STOCK_DESTINATION', message: 'O destino deve ser um estoque ou subestoque ativo.' });
        }

        const movement = Object.assign(new MovementEntity(), {
          requestKey: dto.requestKey,
          type: MovementType.ExternalEntry,
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
          await this.stockPositions.addQuantity({
            productId: dtoItem.productId,
            batchId: dtoItem.batchId,
            stockLocationId: dto.destinationLocationId,
          }, dtoItem.quantity, manager);
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
          action: 'EXTERNAL_ENTRY_CREATE',
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
        if (concurrent?.responsibleUserId === userId) return concurrent;
        throw new ConflictException({ code: 'DUPLICATE_MOVEMENT_REQUEST', message: 'Esta entrada ja foi processada.' });
      }
      throw error;
    }
  }
}
