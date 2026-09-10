import { OmitType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsOptional, Matches, IsUUID, Min, ValidateIf, ValidateNested } from 'class-validator';
import { OperationalLotDto } from '../../batches/dto/operational-lot.dto';
import { CreateEffectiveMovementDto } from './create-effective-movement.dto';

export class CreateExternalEntryItemDto {
  @IsUUID()
  productId!: string;

  // Accept an existing immutable variant for integrations; no master registration required.
  @ValidateIf((item: CreateExternalEntryItemDto) => !item.lot || item.batchId !== undefined)
  @IsUUID()
  batchId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => OperationalLotDto)
  lot?: OperationalLotDto;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreateExternalEntryDto extends OmitType(CreateEffectiveMovementDto, ['items'] as const) {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateExternalEntryItemDto)
  items!: CreateExternalEntryItemDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @Matches(/^[0-9a-f-]{36}:[CONSERVADI]{6}:\d{4}-\d{2}-\d{2}$/, { each: true })
  confirmedExpirationKeys?: string[];
}
