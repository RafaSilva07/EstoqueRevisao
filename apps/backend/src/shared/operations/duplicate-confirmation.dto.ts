import { ArrayMaxSize, ArrayUnique, IsArray, IsOptional, Matches } from 'class-validator';

export class DuplicateConfirmationDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @Matches(/^(MOVEMENT|SHIPMENT):[0-9a-f-]{36}:[0-9a-f]{64}$/, { each: true })
  confirmedDuplicateKeys?: string[];
}
