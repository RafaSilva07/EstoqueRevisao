import { Controller, Get, Header, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthenticatedUser } from '../auth/authenticated-user.interface';
import { RequireAnyPermissions } from '../auth/decorators/require-permissions.decorator';
import { HistoryQueryDto } from './history-query.dto';
import { HistoryService } from './history.service';

@Controller('history')
export class HistoryController {
  constructor(private readonly service: HistoryService) {}

  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @RequireAnyPermissions('shipments.read', 'movements.read', 'pcp.movements.read')
  exportCsv(@Query() query: HistoryQueryDto, @Req() request: Request,
    @Res({ passthrough: true }) response: Response): Promise<string> {
    response.setHeader('Content-Disposition', 'attachment; filename="historico-finalizadas.csv"');
    return this.service.exportCsv(query, request.user as AuthenticatedUser);
  }

  @Get()
  @RequireAnyPermissions('shipments.read', 'movements.read', 'pcp.movements.read')
  list(@Query() query: HistoryQueryDto, @Req() request: Request): ReturnType<HistoryService['list']> {
    return this.service.list(query, request.user as AuthenticatedUser);
  }
}
