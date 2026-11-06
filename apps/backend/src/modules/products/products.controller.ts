import { AdminGuard } from '../users/admin.guard';
import {
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { StatusDto } from '../../shared/dto/status.dto';
import { PaginatedResult } from '../../shared/pagination/paginated-result.interface';
import { getAuditRequestMetadata } from '../audit/audit-request-metadata';
import { AuthenticatedUser } from '../auth/authenticated-user.interface';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateUnitConversionDto } from './dto/create-unit-conversion.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateUnitConversionDto } from './dto/update-unit-conversion.dto';
import { ProductUnitConversionsService } from './product-unit-conversions.service';
import { ProductsService } from './products.service';
import { ProductEntity } from './entities/product.entity';
import { ProductUnitConversionEntity } from './entities/product-unit-conversion.entity';
import { ProductAuditEntry, ProductAuditQueryDto } from './dto/product-audit-query.dto';

@Controller()
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly conversionsService: ProductUnitConversionsService,
  ) {}

  @Get('products')
  @RequirePermissions('products.read')
  list(@Query() query: ProductQueryDto): Promise<PaginatedResult<ProductEntity>> {
    return this.productsService.list(query);
  }

  @Get('products/audit-history')
  @RequirePermissions('products.read')
  @UseGuards(AdminGuard)
  auditHistory(@Query() query: ProductAuditQueryDto): Promise<PaginatedResult<ProductAuditEntry>> {
    return this.productsService.auditHistory(query);
  }

  @Public()
  @Get('products/simulate/expected-not-found')
  simulateExpectedNotFound(): never {
    throw new NotFoundException({
      code: 'PRODUCT_NOT_FOUND',
      message: 'Falha esperada simulada: O produto com o identificador solicitado nao foi localizado no catalogo.',
    });
  }

  @Public()
  @Get('products/simulate/expected-conflict')
  simulateExpectedConflict(): never {
    throw new ConflictException({
      code: 'PRODUCT_CODE_ALREADY_EXISTS',
      message: 'Falha esperada simulada: Conflito de dados - Ja existe um produto cadastrado com este codigo.',
    });
  }

  @Public()
  @Get('products/simulate/unexpected-database')
  simulateUnexpectedDatabase(): never {
    const dbError = new Error('Falha inesperada simulada de conectividade com o banco PostgreSQL');
    (dbError as unknown as { code: string }).code = 'ECONNREFUSED';
    throw dbError;
  }

  @Public()
  @Get('products/simulate/unexpected-crash')
  simulateUnexpectedCrash(): never {
    throw new Error('Falha inesperada simulada no processamento interno de catalogo.');
  }

  @Public()
  @Post('products/simulate-failure')
  simulateFailure(@Body() body: { type: 'conflict' | 'not-found' | 'database' | 'crash' }): never {
    if (body.type === 'not-found') {
      this.simulateExpectedNotFound();
    } else if (body.type === 'conflict') {
      this.simulateExpectedConflict();
    } else if (body.type === 'database') {
      this.simulateUnexpectedDatabase();
    } else {
      this.simulateUnexpectedCrash();
    }
  }

  @Get('products/:id')
  @RequirePermissions('products.read')
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<ProductEntity> {
    return this.productsService.getById(id);
  }

  @Post('products')
  @RequirePermissions('products.create')
  create(@Body() dto: CreateProductDto, @Req() request: Request): Promise<ProductEntity> {
    return this.productsService.create(dto, this.user(request).id, getAuditRequestMetadata(request));
  }

  @Patch('products/:id')
  @RequirePermissions('products.update')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateProductDto,
    @Req() request: Request,
  ): Promise<ProductEntity> {
    return this.productsService.update(id, dto, this.user(request).id, getAuditRequestMetadata(request));
  }

  @Patch('products/:id/status')
  @RequirePermissions('products.manage-status')
  setStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: StatusDto,
    @Req() request: Request,
  ): Promise<ProductEntity> {
    return this.productsService.setStatus(id, dto.active, this.user(request).id, getAuditRequestMetadata(request));
  }

  @Get('products/:productId/conversions')
  @RequirePermissions('product-conversions.read')
  conversions(
    @Param('productId', new ParseUUIDPipe()) productId: string,
  ): Promise<ProductUnitConversionEntity[]> {
    return this.conversionsService.list(productId);
  }

  @Post('products/:productId/conversions')
  @RequirePermissions('product-conversions.create')
  createConversion(
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Body() dto: CreateUnitConversionDto,
    @Req() request: Request,
  ): Promise<ProductUnitConversionEntity> {
    return this.conversionsService.create(
      productId,
      dto,
      this.user(request).id,
      getAuditRequestMetadata(request),
    );
  }

  @Patch('product-conversions/:id')
  @RequirePermissions('product-conversions.update')
  updateConversion(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateUnitConversionDto,
    @Req() request: Request,
  ): Promise<ProductUnitConversionEntity> {
    return this.conversionsService.update(id, dto, this.user(request).id, getAuditRequestMetadata(request));
  }

  @Patch('product-conversions/:id/status')
  @RequirePermissions('product-conversions.manage-status')
  setConversionStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: StatusDto,
    @Req() request: Request,
  ): Promise<ProductUnitConversionEntity> {
    return this.conversionsService.setStatus(
      id,
      dto.active,
      this.user(request).id,
      getAuditRequestMetadata(request),
    );
  }

  private user(request: Request): AuthenticatedUser {
    return request.user as AuthenticatedUser;
  }
}
