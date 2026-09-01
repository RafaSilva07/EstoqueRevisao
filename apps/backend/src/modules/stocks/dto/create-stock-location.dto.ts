import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { emptyStringToNull, trimString, uppercaseString } from '../../../shared/validation/transforms';
import { StockLocationKind } from '../domain/stock-location-kind.enum';

export class CreateStockLocationDto {
  @Transform(uppercaseString)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  code!: string;

  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsString()
  @MaxLength(255)
  description?: string | null;

  @IsEnum(StockLocationKind)
  kind!: StockLocationKind;

  @IsOptional()
  @Transform(emptyStringToNull)
  @IsUUID()
  parentId?: string | null;
}
