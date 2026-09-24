import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res, StreamableFile, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthenticatedUser } from '../auth/authenticated-user.interface';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { getAuditRequestMetadata } from '../audit/audit-request-metadata';
import { OperationalLotsService } from '../batches/operational-lots.service';
import { ResolveOperationalLotDto } from '../batches/dto/operational-lot.dto';
import { AvailableShipmentPositionsQueryDto, CancelShipmentDto, CreateShipmentDto, ExpirationConfirmationDto, RefuseShipmentDto, SeparationDraftDto, ShipmentQueryDto } from './shipment.dto';
import { ShipmentsService } from './shipments.service';
import { CreateShipmentMultipartPipe } from './create-shipment-multipart.pipe';
import { UploadedImage } from '../storage/storage.service';
import { ShipmentPhotosInterceptor } from './shipment-photos.interceptor';
import { AdminGuard } from '../users/admin.guard';

@Controller('shipments')
export class ShipmentsController {
  constructor(
    private readonly service: ShipmentsService,
    private readonly lots: OperationalLotsService,
    private readonly multipart: CreateShipmentMultipartPipe,
  ) {}
  @Post('resolve-lot') @RequirePermissions('shipments.create')
  resolveLot(@Body() dto: ResolveOperationalLotDto): ReturnType<OperationalLotsService['preview']> { return this.lots.preview(dto); }
  @Post() @RequirePermissions('shipments.create')
  @UseInterceptors(ShipmentPhotosInterceptor)
  async create(@Body('payload') payload: string, @UploadedFiles() files: UploadedImage[], @Req() req: Request): ReturnType<ShipmentsService['create']> {
    const dto: CreateShipmentDto = await this.multipart.transform(payload);
    return this.service.create(dto, files ?? [], req.user as AuthenticatedUser, getAuditRequestMetadata(req));
  }
  @Get() @RequirePermissions('shipments.read')
  list(@Query() query: ShipmentQueryDto, @Req() req: Request): ReturnType<ShipmentsService['list']> { return this.service.list(query, req.user as AuthenticatedUser); }
  @Get('available-positions') @RequirePermissions('shipments.create')
  availablePositions(@Query() query: AvailableShipmentPositionsQueryDto, @Req() req: Request): ReturnType<ShipmentsService['availablePositions']> {
    return this.service.availablePositions(query, req.user as AuthenticatedUser);
  }
  @Get(':id/audit-history') @RequirePermissions('shipments.read') @UseGuards(AdminGuard)
  auditHistory(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request): ReturnType<ShipmentsService['auditHistory']> {
    return this.service.auditHistory(id, req.user as AuthenticatedUser);
  }
  @Get(':id') @RequirePermissions('shipments.read')
  get(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request): ReturnType<ShipmentsService['get']> { return this.service.get(id, req.user as AuthenticatedUser); }
  @Get(':id/items/:itemId/photo') @RequirePermissions('shipments.read')
  async photo(@Param('id', new ParseUUIDPipe()) id: string, @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Req() req: Request, @Res({ passthrough: true }) response: Response): Promise<StreamableFile> {
    const photo = await this.service.photo(id, itemId, req.user as AuthenticatedUser);
    response.set({ 'Content-Type': photo.mimeType, 'Content-Length': String(photo.data.length), 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' });
    return new StreamableFile(photo.data);
  }
  @Post(':id/confirmation') @RequirePermissions('shipments.decide')
  confirm(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: ExpirationConfirmationDto, @Req() req: Request): ReturnType<ShipmentsService['decide']> {
    return this.service.decide(id, 'CONFIRMADO', null, dto, req.user as AuthenticatedUser, getAuditRequestMetadata(req));
  }
  @Post(':id/refusal') @RequirePermissions('shipments.decide')
  refuse(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: RefuseShipmentDto, @Req() req: Request): ReturnType<ShipmentsService['decide']> {
    return this.service.decide(id, 'RECUSADO', dto.reason, {}, req.user as AuthenticatedUser, getAuditRequestMetadata(req));
  }
  @Post(':id/cancellation') @RequirePermissions('shipments.read')
  cancel(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: CancelShipmentDto, @Req() req: Request): ReturnType<ShipmentsService['cancel']> {
    return this.service.cancel(id, dto.reason, req.user as AuthenticatedUser, getAuditRequestMetadata(req));
  }
  @Patch(':id/separation-draft') @RequirePermissions('shipments.decide')
  draft(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: SeparationDraftDto, @Req() req: Request): ReturnType<ShipmentsService['saveSeparationDraft']> {
    return this.service.saveSeparationDraft(id, dto, req.user as AuthenticatedUser, getAuditRequestMetadata(req));
  }
  @Post(':id/separation-completion') @RequirePermissions('shipments.decide') @UseInterceptors(ShipmentPhotosInterceptor)
  async completeSeparation(@Param('id', new ParseUUIDPipe()) id: string, @Body('payload') payload: string,
    @UploadedFiles() files: UploadedImage[], @Req() req: Request): ReturnType<ShipmentsService['completeSeparation']> {
    const dto = await this.multipart.separation(payload);
    return this.service.completeSeparation(id, dto, files ?? [], req.user as AuthenticatedUser, getAuditRequestMetadata(req));
  }
}
