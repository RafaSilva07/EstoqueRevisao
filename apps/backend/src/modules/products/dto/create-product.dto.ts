import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsIn, IsInt, IsOptional, IsUUID, Max, Min, IsString, MaxLength, MinLength } from 'class-validator';
import { trimString, uppercaseString } from '../../../shared/validation/transforms';

export class CreateProductDto {
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  code!: string;

  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @Transform(uppercaseString)
  @IsIn(['UN', 'FD', 'CX'])
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  defaultUnit!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  unitsPerPackage?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  unitProductIds?: string[];

  @IsInt()
  @Min(1)
  shelfLifeYears!: number;
}
