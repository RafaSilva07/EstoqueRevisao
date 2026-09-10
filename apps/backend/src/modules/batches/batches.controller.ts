import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { PaginatedResult } from '../../shared/pagination/paginated-result.interface';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { BatchesService } from './batches.service';
import { BatchQueryDto } from './dto/batch-query.dto';
import { BatchEntity } from './entities/batch.entity';

@Controller('batches')
export class BatchesController {
  constructor(private readonly service: BatchesService) {}

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

}
