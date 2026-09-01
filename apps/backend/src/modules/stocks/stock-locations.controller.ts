import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { StatusDto } from '../../shared/dto/status.dto';
import { PaginatedResult } from '../../shared/pagination/paginated-result.interface';
import { getAuditRequestMetadata } from '../audit/audit-request-metadata';
import { AuthenticatedUser } from '../auth/authenticated-user.interface';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CreateStockLocationDto } from './dto/create-stock-location.dto';
import { StockLocationQueryDto } from './dto/stock-location-query.dto';
import { UpdateStockLocationDto } from './dto/update-stock-location.dto';
import { StockLocationEntity } from './entities/stock-location.entity';
import { StockLocationsService } from './stock-locations.service';

@Controller('stocks')
export class StockLocationsController {
  constructor(private readonly service: StockLocationsService) {}

  @Get()
  @RequirePermissions('stocks.read')
  list(@Query() query: StockLocationQueryDto): Promise<PaginatedResult<StockLocationEntity>> {
    return this.service.list(query);
  }

  @Get(':id')
  @RequirePermissions('stocks.read')
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<StockLocationEntity> {
    return this.service.getById(id);
  }

  @Post()
  @RequirePermissions('stocks.create')
  create(
    @Body() dto: CreateStockLocationDto,
    @Req() request: Request,
  ): Promise<StockLocationEntity> {
    const user = request.user as AuthenticatedUser;
    return this.service.create(dto, user.id, getAuditRequestMetadata(request));
  }

  @Patch(':id')
  @RequirePermissions('stocks.update')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateStockLocationDto,
    @Req() request: Request,
  ): Promise<StockLocationEntity> {
    const user = request.user as AuthenticatedUser;
    return this.service.update(id, dto, user.id, getAuditRequestMetadata(request));
  }

  @Patch(':id/status')
  @RequirePermissions('stocks.update')
  setStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: StatusDto,
    @Req() request: Request,
  ): Promise<StockLocationEntity> {
    const user = request.user as AuthenticatedUser;
    return this.service.setStatus(id, dto.active, user.id, getAuditRequestMetadata(request));
  }
}
