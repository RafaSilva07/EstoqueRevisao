import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/pagination/pagination-query.dto';
import { optionalBoolean, trimString } from '../../../shared/validation/transforms';
import { StockLocationKind } from '../domain/stock-location-kind.enum';

export class StockLocationQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsEnum(StockLocationKind)
  kind?: StockLocationKind;

  @IsOptional()
  @Transform(optionalBoolean)
  @IsBoolean()
  active?: boolean;
}
