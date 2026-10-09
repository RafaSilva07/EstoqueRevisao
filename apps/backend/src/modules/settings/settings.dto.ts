import { ArrayMinSize, IsArray, IsInt, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { MAX_RECENT_DUPLICATE_MINUTES } from './recent-duplicate-window';

export class UpdateDuplicateWindowDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(MAX_RECENT_DUPLICATE_MINUTES)
  minutes!: number;
}

export class UpdateSeparationTimeoutDto {
  @Type(() => Number) @IsInt() @Min(5) @Max(1440)
  minutes!: number;
}

export class UpdateReviewDestinationsDto {
  @IsArray() @ArrayMinSize(1) @IsUUID(undefined, { each: true })
  stockLocationIds!: string[];
}

export class UpdateShipmentPhotoLimitsDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(10)
  minimum!: number;

  @Type(() => Number) @IsInt() @Min(1) @Max(10)
  maximum!: number;
}

