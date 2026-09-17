import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { getAuditRequestMetadata } from '../audit/audit-request-metadata';
import { AuthenticatedUser } from '../auth/authenticated-user.interface';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { ExecutePcpMovementDto } from './dto/execute-pcp-movement.dto';
import { PcpMovementQueryDto } from './dto/pcp-movement-query.dto';
import { PcpMovementsService } from './pcp-movements.service';

@Controller('pcp/movements')
export class PcpMovementsController {
  constructor(private readonly service: PcpMovementsService) {}

  @Get() @RequirePermissions('pcp.movements.read')
  list(@Query() query: PcpMovementQueryDto): ReturnType<PcpMovementsService['list']> { return this.service.list(query); }

  @Get(':id') @RequirePermissions('pcp.movements.read')
  get(@Param('id', new ParseUUIDPipe()) id: string): ReturnType<PcpMovementsService['get']> { return this.service.get(id); }

  @Post(':id/execution') @RequirePermissions('pcp.movements.execute')
  execute(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: ExecutePcpMovementDto, @Req() request: Request): ReturnType<PcpMovementsService['execute']> {
    const user = request.user as AuthenticatedUser;
    return this.service.execute(id, dto, user.id, getAuditRequestMetadata(request));
  }
}
