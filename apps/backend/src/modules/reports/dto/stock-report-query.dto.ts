import { Transform, Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/pagination/pagination-query.dto';
import { trimString } from '../../../shared/validation/transforms';

export enum ExpirationStatus {
  Expired = 'VENCIDO',
  ExpiringSoon = 'PROXIMO_VENCIMENTO',
  Valid = 'VALIDO',
}

export class StockReportQueryDto extends PaginationQueryDto {
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
  stockLocationId?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(150)
  location?: string;

  @IsOptional()
  @IsDateString()
  expirationFrom?: string;

  @IsOptional()
  @IsDateString()
  expirationTo?: string;

  @IsOptional()
  @IsEnum(ExpirationStatus)
  expirationStatus?: ExpirationStatus;

  @IsOptional()
  @IsDateString()
  referenceDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  expiringWithinDays = 30;
}
