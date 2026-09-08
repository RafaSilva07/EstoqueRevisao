import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { MovementReportQueryDto } from './dto/movement-report-query.dto';
import { ReviewReportQueryDto } from './dto/review-report-query.dto';
import { StockReportQueryDto } from './dto/stock-report-query.dto';
import { ReportsService } from './reports.service';
import {
  MovementReportItem,
  MovementReportTotals,
  ReportResult,
  ReviewReportItem,
  ReviewReportTotals,
  StockReportItem,
  StockReportTotals,
} from './report.types';

@Controller('reports')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get('movements')
  @RequirePermissions('movements.read')
  movements(@Query() query: MovementReportQueryDto): Promise<ReportResult<MovementReportItem, MovementReportTotals>> {
    return this.service.movements(query);
  }

  @Get('movements.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @RequirePermissions('movements.read')
  movementsCsv(@Query() query: MovementReportQueryDto, @Res({ passthrough: true }) response: Response): Promise<string> {
    this.attachment(response, 'movimentacoes.csv');
    return this.service.movementsCsv(query);
  }

  @Get('reviews')
  @RequirePermissions('movements.read')
  reviews(@Query() query: ReviewReportQueryDto): Promise<ReportResult<ReviewReportItem, ReviewReportTotals>> {
    return this.service.reviews(query);
  }

  @Get('reviews.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @RequirePermissions('movements.read')
  reviewsCsv(@Query() query: ReviewReportQueryDto, @Res({ passthrough: true }) response: Response): Promise<string> {
    this.attachment(response, 'revisoes.csv');
    return this.service.reviewsCsv(query);
  }

  @Get('stock')
  @RequirePermissions('stock-positions.read')
  stock(@Query() query: StockReportQueryDto): Promise<ReportResult<StockReportItem, StockReportTotals>> {
    return this.service.stock(query);
  }

  @Get('stock.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @RequirePermissions('stock-positions.read')
  stockCsv(@Query() query: StockReportQueryDto, @Res({ passthrough: true }) response: Response): Promise<string> {
    this.attachment(response, 'estoque-atual.csv');
    return this.service.stockCsv(query);
  }

  private attachment(response: Response, filename: string): void {
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  }
}
