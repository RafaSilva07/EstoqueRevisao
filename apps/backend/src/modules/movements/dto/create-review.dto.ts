import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { trimString } from '../../../shared/validation/transforms';
import { HasAtMostDecimalPlaces } from '../../../shared/validation/maximum-decimal-places.decorator';

export class CreateReviewDistributionDto {
  @IsUUID()
  destinationLocationId!: string;

  @Type(() => Number)
  @IsNumber()
  @HasAtMostDecimalPlaces(6)
  @Min(0.000001)
  quantity!: number;
}

export class CreateReviewItemDto {
  @IsUUID()
  productId!: string;

  @IsUUID()
  batchId!: string;

  @Type(() => Number)
  @IsNumber()
  @HasAtMostDecimalPlaces(6)
  @Min(0.000001)
  quantity!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CreateReviewDistributionDto)
  distributions!: CreateReviewDistributionDto[];
}

export class CreateReviewDto {
  @IsUUID()
  requestKey!: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  occurredAt?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(1000)
  observation?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateReviewItemDto)
  items!: CreateReviewItemDto[];
}
