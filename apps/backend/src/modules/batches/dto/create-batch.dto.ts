import { Transform } from 'class-transformer';
import { IsDateString, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { uppercaseString } from '../../../shared/validation/transforms';

export class CreateBatchDto {
  @IsUUID()
  productId!: string;

  @IsOptional()
  @Transform(uppercaseString)
  @IsString()
  @Matches(/^[CONSERVADI]{6}$/)
  code?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  manufacturingDate?: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  expirationDate!: string;
}
