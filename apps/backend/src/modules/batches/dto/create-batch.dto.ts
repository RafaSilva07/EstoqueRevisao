import { Transform } from 'class-transformer';
import { IsDateString, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { emptyStringToNull, trimString } from '../../../shared/validation/transforms';

export class CreateBatchDto {
  @IsUUID()
  productId!: string;

  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  code!: string;

  @IsOptional()
  @Transform(emptyStringToNull)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  expirationDate?: string | null;
}
