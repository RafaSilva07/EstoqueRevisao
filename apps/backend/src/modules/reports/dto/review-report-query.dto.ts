import { Transform } from 'class-transformer';
import { IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/pagination/pagination-query.dto';
import { trimString } from '../../../shared/validation/transforms';

export class ReviewReportQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsISO8601({ strict: true })
  dateFrom?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  dateTo?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(200)
  product?: string;

  @IsOptional()
  @IsUUID()
  batchId?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(6)
  batch?: string;

  @IsOptional()
  @IsUUID()
  destinationLocationId?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(150)
  destination?: string;
}
