import { OmitType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { CreateEffectiveMovementDto } from './create-effective-movement.dto';

export class CreateInternalTransferItemDto {
  @IsUUID()
  productId!: string;

  @IsUUID()
  batchId!: string;

  @IsUUID()
  destinationBatchId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreateInternalTransferDto extends OmitType(CreateEffectiveMovementDto, ['items'] as const) {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateInternalTransferItemDto)
  items!: CreateInternalTransferItemDto[];
}
