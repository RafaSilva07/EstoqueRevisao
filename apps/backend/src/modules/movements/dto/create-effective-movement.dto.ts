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

export class CreateEffectiveMovementItemDto {
  @IsUUID()
  productId!: string;

  @IsUUID()
  batchId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  quantity!: number;
}

export class CreateEffectiveMovementDto {
  @IsUUID()
  requestKey!: string;

  @IsUUID()
  originLocationId!: string;

  @IsUUID()
  destinationLocationId!: string;

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
  @Type(() => CreateEffectiveMovementItemDto)
  items!: CreateEffectiveMovementItemDto[];
}
