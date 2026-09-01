import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { getPostgresError } from '../../shared/database/postgres-error';
import { PaginatedResult, paginate } from '../../shared/pagination/paginated-result.interface';
import { AuditService } from '../audit/audit.service';
import { AuditRequestMetadata } from '../audit/audit.types';
import { StockLocationKind } from './domain/stock-location-kind.enum';
import { CreateStockLocationDto } from './dto/create-stock-location.dto';
import { StockLocationQueryDto } from './dto/stock-location-query.dto';
import { UpdateStockLocationDto } from './dto/update-stock-location.dto';
import { StockLocationEntity } from './entities/stock-location.entity';
import { StockLocationsRepository } from './stock-locations.repository';

@Injectable()
export class StockLocationsService {
  constructor(
    private readonly repository: StockLocationsRepository,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  async list(query: StockLocationQueryDto): Promise<PaginatedResult<StockLocationEntity>> {
    const [items, total] = await this.repository.findAndCount(query);
    return paginate(items, total, query.page, query.limit);
  }

  async getById(id: string): Promise<StockLocationEntity> {
    const location = await this.repository.findById(id);
    if (!location) {
      throw this.notFound();
    }
    return location;
  }

  async create(
    dto: CreateStockLocationDto,
    userId: string,
    metadata: AuditRequestMetadata,
  ): Promise<StockLocationEntity> {
    return this.dataSource.transaction(async (manager) => {
      if (await this.repository.existsByCode(dto.code, undefined, manager)) {
        throw this.duplicate();
      }
      await this.validateParent(dto.kind, dto.parentId ?? null, undefined, manager);

      const location = new StockLocationEntity();
      location.code = dto.code;
      location.name = dto.name;
      location.description = dto.description ?? null;
      location.kind = dto.kind;
      location.parentId = dto.parentId ?? null;
      location.active = true;
      location.createdById = userId;
      location.updatedById = userId;
      await this.save(location, manager);
      await this.auditService.record({
        ...metadata,
        manager,
        userId,
        action: 'STOCK_LOCATION_CREATE',
        entityType: 'STOCK_LOCATION',
        entityId: location.id,
        result: 'SUCCESS',
        newValues: this.snapshot(location),
      });
      return location;
    });
  }

  async update(
    id: string,
    dto: UpdateStockLocationDto,
    userId: string,
    metadata: AuditRequestMetadata,
  ): Promise<StockLocationEntity> {
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException({ code: 'EMPTY_UPDATE', message: 'Informe ao menos um campo.' });
    }
    return this.dataSource.transaction(async (manager) => {
      const location = await this.repository.findById(id, manager);
      if (!location) {
        throw this.notFound();
      }
      const before = this.snapshot(location);
      const code = dto.code ?? location.code;
      const kind = dto.kind ?? location.kind;
      const parentId = dto.parentId !== undefined ? dto.parentId : location.parentId;
      if (await this.repository.existsByCode(code, id, manager)) {
        throw this.duplicate();
      }
      if (kind !== StockLocationKind.Stock && await this.repository.hasActiveChildren(id, manager)) {
        throw new ConflictException({
          code: 'STOCK_LOCATION_HAS_ACTIVE_CHILDREN',
          message: 'O local possui subestoques ativos e deve permanecer como estoque.',
        });
      }
      await this.validateParent(kind, parentId, id, manager);

      location.code = code;
      location.name = dto.name ?? location.name;
      if (dto.description !== undefined) {
        location.description = dto.description;
      }
      location.kind = kind;
      location.parentId = parentId;
      location.updatedById = userId;
      await this.save(location, manager);
      await this.auditService.record({
        ...metadata,
        manager,
        userId,
        action: 'STOCK_LOCATION_UPDATE',
        entityType: 'STOCK_LOCATION',
        entityId: location.id,
        result: 'SUCCESS',
        oldValues: before,
        newValues: this.snapshot(location),
      });
      return location;
    });
  }

  async setStatus(
    id: string,
    active: boolean,
    userId: string,
    metadata: AuditRequestMetadata,
  ): Promise<StockLocationEntity> {
    return this.dataSource.transaction(async (manager) => {
      const location = await this.repository.findById(id, manager);
      if (!location) {
        throw this.notFound();
      }
      if (!active && await this.repository.hasActiveChildren(id, manager)) {
        throw new ConflictException({
          code: 'STOCK_LOCATION_HAS_ACTIVE_CHILDREN',
          message: 'Inative primeiro os subestoques vinculados.',
        });
      }
      if (active && location.parentId) {
        await this.validateParent(location.kind, location.parentId, id, manager);
      }
      const before = this.snapshot(location);
      location.active = active;
      location.updatedById = userId;
      await this.repository.save(location, manager);
      await this.auditService.record({
        ...metadata,
        manager,
        userId,
        action: active ? 'STOCK_LOCATION_ACTIVATE' : 'STOCK_LOCATION_DEACTIVATE',
        entityType: 'STOCK_LOCATION',
        entityId: location.id,
        result: 'SUCCESS',
        oldValues: before,
        newValues: this.snapshot(location),
      });
      return location;
    });
  }

  private async validateParent(
    kind: StockLocationKind,
    parentId: string | null,
    currentId: string | undefined,
    manager: EntityManager,
  ): Promise<void> {
    if (kind !== StockLocationKind.Substock) {
      if (parentId) {
        throw new BadRequestException({
          code: 'PARENT_NOT_ALLOWED',
          message: 'Somente subestoques podem possuir um estoque pai.',
        });
      }
      return;
    }
    if (!parentId || parentId === currentId) {
      throw new BadRequestException({
        code: 'INVALID_STOCK_PARENT',
        message: 'Subestoques devem possuir um estoque pai valido.',
      });
    }
    const parent = await this.repository.findById(parentId, manager);
    if (!parent || parent.kind !== StockLocationKind.Stock || !parent.active) {
      throw new BadRequestException({
        code: 'INVALID_STOCK_PARENT',
        message: 'O local pai deve ser um estoque ativo.',
      });
    }
  }

  private async save(location: StockLocationEntity, manager: EntityManager): Promise<void> {
    try {
      await this.repository.save(location, manager);
    } catch (error: unknown) {
      if (getPostgresError(error)?.code === '23505') {
        throw this.duplicate();
      }
      throw error;
    }
  }

  private snapshot(location: StockLocationEntity): Record<string, unknown> {
    return {
      code: location.code,
      name: location.name,
      description: location.description,
      kind: location.kind,
      parentId: location.parentId,
      active: location.active,
    };
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'STOCK_LOCATION_NOT_FOUND',
      message: 'Estoque ou local nao encontrado.',
    });
  }

  private duplicate(): ConflictException {
    return new ConflictException({
      code: 'STOCK_LOCATION_CODE_ALREADY_EXISTS',
      message: 'Ja existe um estoque ou local com esse codigo.',
    });
  }
}
