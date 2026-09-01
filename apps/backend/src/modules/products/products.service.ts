import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditRequestMetadata } from '../audit/audit.types';
import { AuditService } from '../audit/audit.service';
import { PaginatedResult, paginate } from '../../shared/pagination/paginated-result.interface';
import { getPostgresError } from '../../shared/database/postgres-error';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductEntity } from './entities/product.entity';
import { ProductsRepository } from './products.repository';

@Injectable()
export class ProductsService {
  constructor(
    private readonly productsRepository: ProductsRepository,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  async list(query: ProductQueryDto): Promise<PaginatedResult<ProductEntity>> {
    const [items, total] = await this.productsRepository.findAndCount(query);
    return paginate(items, total, query.page, query.limit);
  }

  async getById(id: string): Promise<ProductEntity> {
    const product = await this.productsRepository.findById(id);
    if (!product) {
      throw this.notFound();
    }
    return product;
  }

  async create(
    dto: CreateProductDto,
    userId: string,
    metadata: AuditRequestMetadata,
  ): Promise<ProductEntity> {
    return this.dataSource.transaction(async (manager) => {
      if (await this.productsRepository.existsByCode(dto.code, undefined, manager)) {
        throw this.duplicateCode();
      }

      const product = new ProductEntity();
      product.code = dto.code;
      product.name = dto.name;
      product.defaultUnit = dto.defaultUnit;
      product.active = true;
      product.createdById = userId;
      product.updatedById = userId;

      try {
        await this.productsRepository.save(product, manager);
      } catch (error: unknown) {
        if (getPostgresError(error)?.code === '23505') {
          throw this.duplicateCode();
        }
        throw error;
      }

      await this.auditService.record({
        ...metadata,
        manager,
        userId,
        action: 'PRODUCT_CREATE',
        entityType: 'PRODUCT',
        entityId: product.id,
        result: 'SUCCESS',
        newValues: this.snapshot(product),
      });
      return product;
    });
  }

  async update(
    id: string,
    dto: UpdateProductDto,
    userId: string,
    metadata: AuditRequestMetadata,
  ): Promise<ProductEntity> {
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException({
        code: 'EMPTY_UPDATE',
        message: 'Informe ao menos um campo para alteracao.',
      });
    }

    return this.dataSource.transaction(async (manager) => {
      const product = await this.productsRepository.findById(id, manager);
      if (!product) {
        throw this.notFound();
      }
      const before = this.snapshot(product);

      if (dto.code && await this.productsRepository.existsByCode(dto.code, id, manager)) {
        throw this.duplicateCode();
      }

      product.code = dto.code ?? product.code;
      product.name = dto.name ?? product.name;
      product.defaultUnit = dto.defaultUnit ?? product.defaultUnit;
      product.updatedById = userId;

      try {
        await this.productsRepository.save(product, manager);
      } catch (error: unknown) {
        if (getPostgresError(error)?.code === '23505') {
          throw this.duplicateCode();
        }
        throw error;
      }

      await this.auditService.record({
        ...metadata,
        manager,
        userId,
        action: 'PRODUCT_UPDATE',
        entityType: 'PRODUCT',
        entityId: product.id,
        result: 'SUCCESS',
        oldValues: before,
        newValues: this.snapshot(product),
      });
      return product;
    });
  }

  async setStatus(
    id: string,
    active: boolean,
    userId: string,
    metadata: AuditRequestMetadata,
  ): Promise<ProductEntity> {
    return this.dataSource.transaction(async (manager) => {
      const product = await this.productsRepository.findById(id, manager);
      if (!product) {
        throw this.notFound();
      }
      const before = this.snapshot(product);
      product.active = active;
      product.updatedById = userId;
      await this.productsRepository.save(product, manager);
      await this.auditService.record({
        ...metadata,
        manager,
        userId,
        action: active ? 'PRODUCT_ACTIVATE' : 'PRODUCT_DEACTIVATE',
        entityType: 'PRODUCT',
        entityId: product.id,
        result: 'SUCCESS',
        oldValues: before,
        newValues: this.snapshot(product),
      });
      return product;
    });
  }

  private snapshot(product: ProductEntity): Record<string, unknown> {
    return {
      code: product.code,
      name: product.name,
      defaultUnit: product.defaultUnit,
      active: product.active,
    };
  }

  private notFound(): NotFoundException {
    return new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: 'Produto nao encontrado.' });
  }

  private duplicateCode(): ConflictException {
    return new ConflictException({
      code: 'PRODUCT_CODE_ALREADY_EXISTS',
      message: 'Ja existe um produto com esse codigo.',
    });
  }
}
