import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/pagination/pagination-query.dto';
import { trimString } from '../../../shared/validation/transforms';
import { MovementStatus } from '../../movements/domain/movement-status.enum';
import { MovementType } from '../../movements/domain/movement-type.enum';

export class MovementReportQueryDto extends PaginationQueryDto {
  @IsOptional() @IsIn(['RECENT','OLDEST','PRODUCT']) sort?: 'RECENT' | 'OLDEST' | 'PRODUCT' = 'RECENT';
  @IsOptional()
  @IsISO8601({ strict: true })
  dateFrom?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  dateTo?: string;

  @IsOptional()
  @IsEnum(MovementType)
  type?: MovementType;

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
  originLocationId?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(150)
  origin?: string;

  @IsOptional()
  @IsUUID()
  destinationLocationId?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(150)
  destination?: string;

  @IsOptional()
  @IsUUID()
  responsibleUserId?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(100)
  responsible?: string;

  @IsOptional()
  @IsEnum(MovementStatus)
  status?: MovementStatus;
}
