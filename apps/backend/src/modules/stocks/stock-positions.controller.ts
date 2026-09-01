import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { PaginatedResult } from '../../shared/pagination/paginated-result.interface';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { StockPositionQueryDto } from './dto/stock-position-query.dto';
import { StockPositionEntity } from './entities/stock-position.entity';
import { StockPositionsService } from './stock-positions.service';

@Controller('stock-positions')
export class StockPositionsController {
  constructor(private readonly service: StockPositionsService) {}

  @Get()
  @RequirePermissions('stock-positions.read')
  list(@Query() query: StockPositionQueryDto): Promise<PaginatedResult<StockPositionEntity>> {
    return this.service.list(query);
  }

  @Get(':id')
  @RequirePermissions('stock-positions.read')
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<StockPositionEntity> {
    return this.service.getById(id);
  }
}
