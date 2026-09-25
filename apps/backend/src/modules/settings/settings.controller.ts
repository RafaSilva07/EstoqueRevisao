import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { getAuditRequestMetadata } from '../audit/audit-request-metadata';
import { AuthenticatedUser } from '../auth/authenticated-user.interface';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AdminGuard } from '../users/admin.guard';
import { UpdateReviewDestinationsDto, UpdateSeparationTimeoutDto, UpdateShipmentPhotoLimitsDto } from './settings.dto';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('operational') @RequirePermissions('movements.create')
  operational(): ReturnType<SettingsService['getOperational']> { return this.settings.getOperational(); }

  @Get('shipment-photos') @RequirePermissions('shipments.read')
  shipmentPhotos(): ReturnType<SettingsService['photoLimits']> { return this.settings.photoLimits(); }

  @Get() @UseGuards(AdminGuard)
  get(): ReturnType<SettingsService['getOperational']> { return this.settings.getOperational(); }

  @Patch('immediate-separation') @UseGuards(AdminGuard)
  timeout(@Body() dto: UpdateSeparationTimeoutDto, @Req() req: Request): ReturnType<SettingsService['updateTimeout']> {
    return this.settings.updateTimeout(dto.minutes, (req.user as AuthenticatedUser).id, getAuditRequestMetadata(req));
  }

  @Patch('review-destinations') @UseGuards(AdminGuard)
  destinations(@Body() dto: UpdateReviewDestinationsDto, @Req() req: Request): ReturnType<SettingsService['updateReviewDestinations']> {
    return this.settings.updateReviewDestinations(dto.stockLocationIds, (req.user as AuthenticatedUser).id, getAuditRequestMetadata(req));
  }

  @Patch('shipment-photos') @UseGuards(AdminGuard)
  photoLimits(@Body() dto: UpdateShipmentPhotoLimitsDto, @Req() req: Request): ReturnType<SettingsService['updatePhotoLimits']> {
    return this.settings.updatePhotoLimits(dto, (req.user as AuthenticatedUser).id, getAuditRequestMetadata(req));
  }
}

