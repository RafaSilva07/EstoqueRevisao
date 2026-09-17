import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
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
      await manager.query("SELECT pg_advisory_xact_lock(hashtext('product-packaging'))");
      if (await this.productsRepository.existsByCode(dto.code, undefined, manager)) {
        throw this.duplicateCode();
      }

      const product = new ProductEntity();
      product.code = dto.code;
      product.name = dto.name;
      product.defaultUnit = dto.defaultUnit;
      product.shelfLifeYears = dto.shelfLifeYears;
      product.active = true;
      product.createdById = userId;
      product.updatedById = userId;
      this.configureUnitWeight(product, dto);
      await this.configurePackaging(product, dto, manager);

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
      await manager.query("SELECT pg_advisory_xact_lock(hashtext('product-packaging'))");
      const product = await this.productsRepository.findById(id, manager);
      if (!product) {
        throw this.notFound();
      }
      const before = this.snapshot(product);

      if ((dto.defaultUnit && dto.defaultUnit !== product.defaultUnit)
        || (dto.unitsPerPackage !== undefined && product.unitsPerPackage !== null && dto.unitsPerPackage !== product.unitsPerPackage)) {
        const used = await manager.query<unknown[]>('SELECT 1 FROM batches WHERE product_id=$1 LIMIT 1', [id]);
        if (used.length) throw new ConflictException('Produto já utilizado: não é possível alterar a unidade ou a quantidade por embalagem. Cadastre outro código.');
        const referenced = await manager.query<unknown[]>('SELECT 1 FROM product_unit_options WHERE unit_product_id=$1 LIMIT 1', [id]);
        if (referenced.length && dto.defaultUnit && dto.defaultUnit !== 'UN') throw new ConflictException('Este produto unitário está vinculado a uma embalagem.');
      }

      if (dto.code && await this.productsRepository.existsByCode(dto.code, id, manager)) {
        throw this.duplicateCode();
      }

      product.code = dto.code ?? product.code;
      product.name = dto.name ?? product.name;
      product.defaultUnit = dto.defaultUnit ?? product.defaultUnit;
      product.shelfLifeYears = dto.shelfLifeYears ?? product.shelfLifeYears;
      product.updatedById = userId;
      this.configureUnitWeight(product, dto);
      await this.configurePackaging(product, dto, manager);

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
      shelfLifeYears: product.shelfLifeYears,
      active: product.active,
      unitsPerPackage: product.unitsPerPackage,
      unitWeightGrams: product.unitWeightGrams,
      unitProductIds: product.unitProducts?.map((unit) => unit.id) ?? [],
    };
  }

  private configureUnitWeight(product: ProductEntity, dto: UpdateProductDto): void {
    const weight = dto.unitWeightGrams === undefined ? product.unitWeightGrams : dto.unitWeightGrams;
    if (product.defaultUnit === 'UN') {
      if (!Number.isSafeInteger(weight) || !weight || weight < 1) {
        throw new BadRequestException('Informe a gramatura da unidade em gramas inteiras e positivas.');
      }
      product.unitWeightGrams = weight;
      return;
    }
    if (dto.unitWeightGrams != null) {
      throw new BadRequestException('Gramatura por unidade deve ser informada somente para produtos UN.');
    }
    product.unitWeightGrams = null;
  }

  private async configurePackaging(product: ProductEntity, dto: UpdateProductDto, manager: EntityManager): Promise<void> {
    const packageUnit = ['FD', 'CX'].includes(product.defaultUnit);
    if (!packageUnit) {
      if (dto.unitsPerPackage != null || dto.unitProductIds?.length) throw new BadRequestException('Somente fardo/caixa pode possuir unidades e códigos vinculados.');
      product.unitsPerPackage = null;
      product.unitProducts = [];
      return;
    }
    const units = dto.unitsPerPackage === undefined ? product.unitsPerPackage : dto.unitsPerPackage;
    const ids = dto.unitProductIds ?? product.unitProducts?.map((unit) => unit.id) ?? [];
    if (!Number.isSafeInteger(units) || !units || units < 1 || !ids.length || new Set(ids).size !== ids.length) {
      throw new BadRequestException('Informe a quantidade inteira de unidades por embalagem e ao menos um código unitário.');
    }
    const products = await manager.getRepository(ProductEntity).findBy({ id: In(ids) });
    if (products.length !== ids.length || products.some((unit) => unit.id === product.id || unit.defaultUnit !== 'UN' || !unit.active)) {
      throw new BadRequestException('Vincule somente produtos unitários (UN) ativos, diferentes da embalagem.');
    }
    product.unitsPerPackage = units;
    product.unitProducts = products;
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
