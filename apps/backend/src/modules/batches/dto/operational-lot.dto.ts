import { IsDateString, IsUUID, Matches } from 'class-validator';
import { ResolveBatchCodeDto } from './resolve-batch-code.dto';

export class ResolveOperationalLotDto extends ResolveBatchCodeDto {
  @IsUUID()
  productId!: string;
}

export class OperationalLotDto extends ResolveBatchCodeDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  expirationDate!: string;
}
