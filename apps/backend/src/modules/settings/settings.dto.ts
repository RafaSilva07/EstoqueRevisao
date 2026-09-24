import { ArrayMinSize, IsArray, IsInt, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateSeparationTimeoutDto {
  @Type(() => Number) @IsInt() @Min(5) @Max(1440)
  minutes!: number;
}

export class UpdateReviewDestinationsDto {
  @IsArray() @ArrayMinSize(1) @IsUUID(undefined, { each: true })
  stockLocationIds!: string[];
}

