import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../users/admin.guard';
import { DataQualityService } from './data-quality.service';
import { DataQualityDimension, DataQualityReportDto, DataQualitySeverity } from './data-quality.types';

@Controller('data-quality')
@UseGuards(AdminGuard)
export class DataQualityController {
  constructor(private readonly dataQualityService: DataQualityService) {}

  @Get('report')
  getReport(
    @Query('dimension') dimension?: DataQualityDimension,
    @Query('severity') severity?: DataQualitySeverity,
    @Query('search') search?: string,
  ): Promise<DataQualityReportDto> {
    return this.dataQualityService.getReport({ dimension, severity, search });
  }
}
