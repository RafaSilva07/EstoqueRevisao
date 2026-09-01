import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
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
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  defaultUnit!: string;
}
