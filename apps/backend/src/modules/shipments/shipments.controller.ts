import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedUser } from '../auth/authenticated-user.interface';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { getAuditRequestMetadata } from '../audit/audit-request-metadata';
import { OperationalLotsService } from '../batches/operational-lots.service';
import { ResolveOperationalLotDto } from '../batches/dto/operational-lot.dto';
import { AvailableShipmentPositionsQueryDto, CreateShipmentDto, ExpirationConfirmationDto, RefuseShipmentDto, ShipmentQueryDto } from './shipment.dto';
import { ShipmentsService } from './shipments.service';

@Controller('shipments')
export class ShipmentsController {
  constructor(private readonly service: ShipmentsService, private readonly lots: OperationalLotsService) {}
  @Post('resolve-lot') @RequirePermissions('shipments.create')
  resolveLot(@Body() dto: ResolveOperationalLotDto): ReturnType<OperationalLotsService['preview']> { return this.lots.preview(dto); }
  @Post() @RequirePermissions('shipments.create')
  create(@Body() dto: CreateShipmentDto, @Req() req: Request): ReturnType<ShipmentsService['create']> {
    return this.service.create(dto, req.user as AuthenticatedUser, getAuditRequestMetadata(req));
  }
  @Get() @RequirePermissions('shipments.read')
  list(@Query() query: ShipmentQueryDto, @Req() req: Request): ReturnType<ShipmentsService['list']> { return this.service.list(query, req.user as AuthenticatedUser); }
  @Get('available-positions') @RequirePermissions('shipments.create')
  availablePositions(@Query() query: AvailableShipmentPositionsQueryDto, @Req() req: Request): ReturnType<ShipmentsService['availablePositions']> {
    return this.service.availablePositions(query, req.user as AuthenticatedUser);
  }
  @Get(':id') @RequirePermissions('shipments.read')
  get(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request): ReturnType<ShipmentsService['get']> { return this.service.get(id, req.user as AuthenticatedUser); }
  @Post(':id/confirmation') @RequirePermissions('shipments.decide')
  confirm(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: ExpirationConfirmationDto, @Req() req: Request): ReturnType<ShipmentsService['decide']> {
    return this.service.decide(id, 'CONFIRMADO', null, dto, req.user as AuthenticatedUser, getAuditRequestMetadata(req));
  }
  @Post(':id/refusal') @RequirePermissions('shipments.decide')
  refuse(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: RefuseShipmentDto, @Req() req: Request): ReturnType<ShipmentsService['decide']> {
    return this.service.decide(id, 'RECUSADO', dto.reason, {}, req.user as AuthenticatedUser, getAuditRequestMetadata(req));
  }
}
