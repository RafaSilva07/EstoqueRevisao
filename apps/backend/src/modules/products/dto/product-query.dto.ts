import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/pagination/pagination-query.dto';
import { optionalBoolean, trimString } from '../../../shared/validation/transforms';

export class ProductQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['UN', 'FD', 'CX'])
  defaultUnit?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(['code', 'name'])
  searchField?: 'code' | 'name';

  @IsOptional()
  @Transform(optionalBoolean)
  @IsBoolean()
  active?: boolean;
}
