import { Type, Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { OperationalLotDto } from '../batches/dto/operational-lot.dto';
import { PaginationQueryDto } from '../../shared/pagination/pagination-query.dto';
import { trimString } from '../../shared/validation/transforms';
import { Sector } from './shipment.entity';

export class ShipmentItemDto {
  @IsUUID() productId!: string;
  @IsOptional() @IsUUID() batchId?: string;
  @IsOptional() @IsUUID() stockLocationId?: string;
  @IsOptional() @ValidateNested() @Type(() => OperationalLotDto) lot?: OperationalLotDto;
  @Type(() => Number) @IsInt() @Min(1) quantity!: number;
  @IsOptional() @Transform(trimString) @IsString() @MaxLength(1000) observation?: string;
}
export class ExpirationConfirmationDto {
  @IsOptional() @IsArray() @ArrayMaxSize(1000)
  @Matches(/^[0-9a-f-]{36}:[CONSERVADI]{6}:\d{4}-\d{2}-\d{2}$/, { each: true })
  confirmedExpirationKeys?: string[];
}
export class CreateShipmentDto extends ExpirationConfirmationDto {
  @IsUUID() requestKey!: string;
  @IsIn(['REVISAO','PRODUCAO','EXPEDICAO']) destinationSector!: Sector;
  @IsOptional() @Transform(trimString) @IsString() @MaxLength(1000) observation?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => ShipmentItemDto)
  items!: ShipmentItemDto[];
}
export class RefuseShipmentDto extends ExpirationConfirmationDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(1) @MaxLength(1000) reason!: string;
}
export class ShipmentQueryDto extends PaginationQueryDto {
  @IsOptional() @IsIn(['pending','sent','history','updates']) view: 'pending' | 'sent' | 'history' | 'updates' = 'pending';
}

export class AvailableShipmentPositionsQueryDto extends PaginationQueryDto {
  @IsUUID()
  productId!: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(100)
  batchCode?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  manufacturingDate?: string;
}
