import { Controller, Get, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedUser } from '../auth/authenticated-user.interface';
import { RequireAnyPermissions } from '../auth/decorators/require-permissions.decorator';
import { HistoryQueryDto } from './history-query.dto';
import { HistoryService } from './history.service';

@Controller('history')
export class HistoryController {
  constructor(private readonly service: HistoryService) {}

  @Get()
  @RequireAnyPermissions('shipments.read', 'movements.read', 'pcp.movements.read')
  list(@Query() query: HistoryQueryDto, @Req() request: Request): ReturnType<HistoryService['list']> {
    return this.service.list(query, request.user as AuthenticatedUser);
  }
}
