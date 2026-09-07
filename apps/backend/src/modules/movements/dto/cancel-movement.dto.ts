import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { trimString } from '../../../shared/validation/transforms';

export class CancelMovementDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}
