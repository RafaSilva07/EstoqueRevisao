import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { getPostgresError } from '../../shared/database/postgres-error';
import { AuditService } from '../audit/audit.service';
import { AuditRequestMetadata } from '../audit/audit.types';
import { CreateUnitConversionDto } from './dto/create-unit-conversion.dto';
import { UpdateUnitConversionDto } from './dto/update-unit-conversion.dto';
import { ProductUnitConversionEntity } from './entities/product-unit-conversion.entity';
import { ProductUnitConversionsRepository } from './product-unit-conversions.repository';
import { ProductsRepository } from './products.repository';

@Injectable()
export class ProductUnitConversionsService {
  constructor(
    private readonly repository: ProductUnitConversionsRepository,
    private readonly productsRepository: ProductsRepository,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  async list(productId: string): Promise<ProductUnitConversionEntity[]> {
    await this.requireProduct(productId);
    return this.repository.findByProduct(productId);
  }

  async create(
    productId: string,
    dto: CreateUnitConversionDto,
    userId: string,
    metadata: AuditRequestMetadata,
  ): Promise<ProductUnitConversionEntity> {
    this.validateUnits(dto.fromUnit, dto.toUnit);
    return this.dataSource.transaction(async (manager) => {
      const product = await this.productsRepository.findById(productId, manager);
      if (!product) {
        throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: 'Produto nao encontrado.' });
      }
      if (!product.active) {
        throw new ConflictException({
          code: 'PRODUCT_INACTIVE',
          message: 'Nao e permitido cadastrar conversao para produto inativo.',
        });
      }
      if (await this.repository.existsByUnits(productId, dto.fromUnit, dto.toUnit, undefined, manager)) {
        throw this.duplicate();
      }

      const conversion = new ProductUnitConversionEntity();
      conversion.productId = productId;
      conversion.fromUnit = dto.fromUnit;
      conversion.toUnit = dto.toUnit;
      conversion.factor = dto.factor;
      conversion.active = true;
      conversion.createdById = userId;
      conversion.updatedById = userId;
      await this.save(conversion, manager);
      await this.auditService.record({
        ...metadata,
        manager,
        userId,
        action: 'PRODUCT_CONVERSION_CREATE',
        entityType: 'PRODUCT_UNIT_CONVERSION',
        entityId: conversion.id,
        result: 'SUCCESS',
        newValues: this.snapshot(conversion),
      });
      return conversion;
    });
  }

  async update(
    id: string,
    dto: UpdateUnitConversionDto,
    userId: string,
    metadata: AuditRequestMetadata,
  ): Promise<ProductUnitConversionEntity> {
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException({ code: 'EMPTY_UPDATE', message: 'Informe ao menos um campo.' });
    }
    return this.dataSource.transaction(async (manager) => {
      const conversion = await this.repository.findById(id, manager);
      if (!conversion) {
        throw this.notFound();
      }
      const before = this.snapshot(conversion);
      const fromUnit = dto.fromUnit ?? conversion.fromUnit;
      const toUnit = dto.toUnit ?? conversion.toUnit;
      this.validateUnits(fromUnit, toUnit);
      if (await this.repository.existsByUnits(
        conversion.productId,
        fromUnit,
        toUnit,
        id,
        manager,
      )) {
        throw this.duplicate();
      }
      conversion.fromUnit = fromUnit;
      conversion.toUnit = toUnit;
      conversion.factor = dto.factor ?? conversion.factor;
      conversion.updatedById = userId;
      await this.save(conversion, manager);
      await this.auditService.record({
        ...metadata,
        manager,
        userId,
        action: 'PRODUCT_CONVERSION_UPDATE',
        entityType: 'PRODUCT_UNIT_CONVERSION',
        entityId: conversion.id,
        result: 'SUCCESS',
        oldValues: before,
        newValues: this.snapshot(conversion),
      });
      return conversion;
    });
  }

  async setStatus(
    id: string,
    active: boolean,
    userId: string,
    metadata: AuditRequestMetadata,
  ): Promise<ProductUnitConversionEntity> {
    return this.dataSource.transaction(async (manager) => {
      const conversion = await this.repository.findById(id, manager);
      if (!conversion) {
        throw this.notFound();
      }
      const before = this.snapshot(conversion);
      conversion.active = active;
      conversion.updatedById = userId;
      await this.repository.save(conversion, manager);
      await this.auditService.record({
        ...metadata,
        manager,
        userId,
        action: active ? 'PRODUCT_CONVERSION_ACTIVATE' : 'PRODUCT_CONVERSION_DEACTIVATE',
        entityType: 'PRODUCT_UNIT_CONVERSION',
        entityId: conversion.id,
        result: 'SUCCESS',
        oldValues: before,
        newValues: this.snapshot(conversion),
      });
      return conversion;
    });
  }

  private async requireProduct(productId: string): Promise<void> {
    if (!await this.productsRepository.findById(productId)) {
      throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: 'Produto nao encontrado.' });
    }
  }

  private validateUnits(fromUnit: string, toUnit: string): void {
    if (fromUnit.toLowerCase() === toUnit.toLowerCase()) {
      throw new BadRequestException({
        code: 'EQUAL_CONVERSION_UNITS',
        message: 'As unidades de origem e destino devem ser diferentes.',
      });
    }
  }

  private async save(
    conversion: ProductUnitConversionEntity,
    manager: Parameters<ProductUnitConversionsRepository['save']>[1],
  ): Promise<void> {
    try {
      await this.repository.save(conversion, manager);
    } catch (error: unknown) {
      if (getPostgresError(error)?.code === '23505') {
        throw this.duplicate();
      }
      throw error;
    }
  }

  private snapshot(conversion: ProductUnitConversionEntity): Record<string, unknown> {
    return {
      productId: conversion.productId,
      fromUnit: conversion.fromUnit,
      toUnit: conversion.toUnit,
      factor: conversion.factor,
      active: conversion.active,
    };
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'PRODUCT_CONVERSION_NOT_FOUND',
      message: 'Conversao de unidade nao encontrada.',
    });
  }

  private duplicate(): ConflictException {
    return new ConflictException({
      code: 'PRODUCT_CONVERSION_ALREADY_EXISTS',
      message: 'Ja existe uma conversao entre essas unidades para o produto.',
    });
  }
}
