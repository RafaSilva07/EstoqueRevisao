import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { getPostgresError } from '../../shared/database/postgres-error';
import { PaginatedResult, paginate } from '../../shared/pagination/paginated-result.interface';
import { AuditService } from '../audit/audit.service';
import { AuditRequestMetadata } from '../audit/audit.types';
import { ProductsRepository } from '../products/products.repository';
import { BatchesRepository } from './batches.repository';
import { BatchQueryDto } from './dto/batch-query.dto';
import { CreateBatchDto } from './dto/create-batch.dto';
import { UpdateBatchDto } from './dto/update-batch.dto';
import { BatchEntity } from './entities/batch.entity';

@Injectable()
export class BatchesService {
  constructor(
    private readonly batchesRepository: BatchesRepository,
    private readonly productsRepository: ProductsRepository,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  async list(query: BatchQueryDto): Promise<PaginatedResult<BatchEntity>> {
    const [items, total] = await this.batchesRepository.findAndCount(query);
    return paginate(items, total, query.page, query.limit);
  }

  async getById(id: string): Promise<BatchEntity> {
    const batch = await this.batchesRepository.findById(id);
    if (!batch) {
      throw this.notFound();
    }
    return batch;
  }

  async create(
    dto: CreateBatchDto,
    userId: string,
    metadata: AuditRequestMetadata,
  ): Promise<BatchEntity> {
    return this.dataSource.transaction(async (manager) => {
      const product = await this.productsRepository.findById(dto.productId, manager);
      if (!product) {
        throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: 'Produto nao encontrado.' });
      }
      if (!product.active) {
        throw new ConflictException({
          code: 'PRODUCT_INACTIVE',
          message: 'Nao e permitido cadastrar lote para produto inativo.',
        });
      }
      if (await this.batchesRepository.existsByCode(dto.productId, dto.code, undefined, manager)) {
        throw this.duplicate();
      }

      const batch = new BatchEntity();
      batch.productId = dto.productId;
      batch.code = dto.code;
      batch.expirationDate = dto.expirationDate ?? null;
      batch.createdById = userId;
      batch.updatedById = userId;
      await this.save(batch, manager);
      await this.auditService.record({
        ...metadata,
        manager,
        userId,
        action: 'BATCH_CREATE',
        entityType: 'BATCH',
        entityId: batch.id,
        result: 'SUCCESS',
        newValues: this.snapshot(batch),
      });
      return batch;
    });
  }

  async update(
    id: string,
    dto: UpdateBatchDto,
    userId: string,
    metadata: AuditRequestMetadata,
  ): Promise<BatchEntity> {
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException({ code: 'EMPTY_UPDATE', message: 'Informe ao menos um campo.' });
    }
    return this.dataSource.transaction(async (manager) => {
      const batch = await this.batchesRepository.findById(id, manager);
      if (!batch) {
        throw this.notFound();
      }
      const before = this.snapshot(batch);
      const code = dto.code ?? batch.code;
      if (await this.batchesRepository.existsByCode(batch.productId, code, id, manager)) {
        throw this.duplicate();
      }
      batch.code = code;
      if (dto.expirationDate !== undefined) {
        batch.expirationDate = dto.expirationDate;
      }
      batch.updatedById = userId;
      await this.save(batch, manager);
      await this.auditService.record({
        ...metadata,
        manager,
        userId,
        action: 'BATCH_UPDATE',
        entityType: 'BATCH',
        entityId: batch.id,
        result: 'SUCCESS',
        oldValues: before,
        newValues: this.snapshot(batch),
      });
      return batch;
    });
  }

  private async save(batch: BatchEntity, manager: Parameters<BatchesRepository['save']>[1]): Promise<void> {
    try {
      await this.batchesRepository.save(batch, manager);
    } catch (error: unknown) {
      if (getPostgresError(error)?.code === '23505') {
        throw this.duplicate();
      }
      throw error;
    }
  }

  private snapshot(batch: BatchEntity): Record<string, unknown> {
    return {
      productId: batch.productId,
      code: batch.code,
      expirationDate: batch.expirationDate,
    };
  }

  private notFound(): NotFoundException {
    return new NotFoundException({ code: 'BATCH_NOT_FOUND', message: 'Lote nao encontrado.' });
  }

  private duplicate(): ConflictException {
    return new ConflictException({
      code: 'BATCH_CODE_ALREADY_EXISTS',
      message: 'Ja existe um lote com esse codigo para o produto.',
    });
  }
}
