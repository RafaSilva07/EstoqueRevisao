import { Transform, Type } from 'class-transformer';
import { IsNumber, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { uppercaseString } from '../../../shared/validation/transforms';

export class CreateUnitConversionDto {
  @Transform(uppercaseString)
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  fromUnit!: string;

  @Transform(uppercaseString)
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  toUnit!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  factor!: number;
}
