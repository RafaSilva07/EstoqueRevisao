import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/pagination/pagination-query.dto';

export class StockPositionQueryDto extends PaginationQueryDto {
  @IsOptional() @IsIn(['PRODUCT','QUANTITY','EXPIRATION']) sort?: 'PRODUCT' | 'QUANTITY' | 'EXPIRATION' = 'PRODUCT';
  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsUUID()
  batchId?: string;

  @IsOptional()
  @IsUUID()
  stockLocationId?: string;
}
