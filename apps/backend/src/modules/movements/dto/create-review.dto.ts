import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { trimString } from '../../../shared/validation/transforms';

export class CreateReviewDistributionDto {
  @IsUUID()
  destinationLocationId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreateReviewItemDto {
  @IsOptional()
  @IsUUID()
  outputProductId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  expectedUnitsPerPackage?: number;

  @IsUUID()
  productId!: string;

  @IsUUID()
  batchId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CreateReviewDistributionDto)
  distributions!: CreateReviewDistributionDto[];
}

export class CreateReviewDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  confirmedExpirationKeys?: string[];

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
