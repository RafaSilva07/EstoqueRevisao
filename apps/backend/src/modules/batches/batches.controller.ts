import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { PaginatedResult } from '../../shared/pagination/paginated-result.interface';
import { getAuditRequestMetadata } from '../audit/audit-request-metadata';
import { AuthenticatedUser } from '../auth/authenticated-user.interface';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { BatchesService } from './batches.service';
import { BatchQueryDto } from './dto/batch-query.dto';
import { CreateBatchDto } from './dto/create-batch.dto';
import { UpdateBatchDto } from './dto/update-batch.dto';
import { BatchEntity } from './entities/batch.entity';
import { ResolveBatchCodeDto } from './dto/resolve-batch-code.dto';
import { ResolvedBatchCode } from './domain/batch-code.codec';

@Controller('batches')
export class BatchesController {
  constructor(private readonly service: BatchesService) {}

  @Post('resolve-code')
  @RequirePermissions('batches.read')
  resolveCode(@Body() dto: ResolveBatchCodeDto): ResolvedBatchCode {
    return this.service.resolveCode(dto);
  }

  @Get()
  @RequirePermissions('batches.read')
  list(@Query() query: BatchQueryDto): Promise<PaginatedResult<BatchEntity>> {
    return this.service.list(query);
  }

  @Get(':id')
  @RequirePermissions('batches.read')
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<BatchEntity> {
    return this.service.getById(id);
  }

  @Post()
  @RequirePermissions('batches.create')
  create(@Body() dto: CreateBatchDto, @Req() request: Request): Promise<BatchEntity> {
    const user = request.user as AuthenticatedUser;
    return this.service.create(dto, user.id, getAuditRequestMetadata(request));
  }

  @Patch(':id')
  @RequirePermissions('batches.update')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateBatchDto,
    @Req() request: Request,
  ): Promise<BatchEntity> {
    const user = request.user as AuthenticatedUser;
    return this.service.update(id, dto, user.id, getAuditRequestMetadata(request));
  }
}
