import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsIn, IsInt, IsOptional, IsUUID, Matches, Max, Min, IsString, MaxLength, MinLength } from 'class-validator';
import { trimString, uppercaseString } from '../../../shared/validation/transforms';

export class CreateProductDto {
  @Transform(trimString)
  @IsString()
  @Matches(/^[0-9]{6}(?:\.[0-9]{2})?$/, { message: 'O código deve ter 6 dígitos, com ponto e 2 dígitos opcionais (ex.: 123456 ou 123456.78).' })
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
  @IsInt()
  @Min(1)
  @Max(2147483647)
  unitWeightGrams?: number | null;

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
