import { Type, Transform } from 'class-transformer';
import { IntersectionType } from '@nestjs/mapped-types';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { OperationalLotDto } from '../batches/dto/operational-lot.dto';
import { PaginationQueryDto } from '../../shared/pagination/pagination-query.dto';
import { trimString } from '../../shared/validation/transforms';
import { Sector, ShipmentLoadingStatus, ShipmentStatus } from './shipment.entity';
import { DuplicateConfirmationDto } from '../../shared/operations/duplicate-confirmation.dto';

export class ShipmentAssemblySourceDto {
  @IsUUID() batchId!: string;
  @IsUUID() stockLocationId!: string;
  @Type(() => Number) @IsInt() @Min(1) quantity!: number;
}
export class ShipmentAssemblyDto {
  @IsUUID() packageProductId!: string;
  @IsBoolean() mixedDates!: boolean;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => ShipmentAssemblySourceDto)
  sources!: ShipmentAssemblySourceDto[];
}
export class ShipmentItemDto {
  @IsUUID() productId!: string;
  @IsOptional() @IsUUID() batchId?: string;
  @IsOptional() @IsUUID() stockLocationId?: string;
  @IsOptional() @ValidateNested() @Type(() => OperationalLotDto) lot?: OperationalLotDto;
  @Type(() => Number) @IsInt() @Min(1) quantity!: number;
  @IsOptional() @Transform(trimString) @IsString() @MaxLength(1000) observation?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10) photoCount?: number;
  @IsOptional() @ValidateNested() @Type(() => ShipmentAssemblyDto) assembly?: ShipmentAssemblyDto;
}
export class ExpirationConfirmationDto {
  @IsOptional() @IsArray() @ArrayMaxSize(1000)
  @Matches(/^[0-9a-f-]{36}:[CONSERVADI]{6}:\d{4}-\d{2}-\d{2}$/, { each: true })
  confirmedExpirationKeys?: string[];
  @IsOptional() @IsBoolean() immediateSeparation?: boolean;
}

export class SeparationItemDto {
  @IsUUID() shipmentItemId!: string;
  @Type(() => Number) @IsInt() @Min(0) returnQuantity!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10) photoCount?: number;
}

export class SeparationDraftDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => SeparationItemDto)
  items!: SeparationItemDto[];
}

export class CompleteSeparationDto extends SeparationDraftDto {}
export class CreateShipmentDto extends IntersectionType(ExpirationConfirmationDto, DuplicateConfirmationDto) {
  @IsUUID() requestKey!: string;
  @IsIn(['REVISAO','PRODUCAO','EXPEDICAO']) destinationSector!: Sector;
  @IsOptional() @IsIn(['CARREGADO', 'NAO_CARREGADO']) loadingStatus?: ShipmentLoadingStatus;
  @IsOptional() @Transform(trimString) @IsString() @MaxLength(20) vehiclePlate?: string;
  @IsOptional() @Transform(trimString) @IsString() @MaxLength(1000) observation?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => ShipmentItemDto)
  items!: ShipmentItemDto[];
}
export class RefuseShipmentDto extends ExpirationConfirmationDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(1) @MaxLength(1000) reason!: string;
}
export class CancelShipmentDto {
  @Transform(trimString)
  @IsString() @MinLength(1) @MaxLength(1000) reason!: string;
}
export class CorrectShipmentItemDto {
  @IsUUID() shipmentItemId!: string;
  @Type(() => Number) @IsInt() @Min(1) quantity!: number;
  @IsOptional() @Transform(trimString) @IsString() @MaxLength(1000) observation?: string;
}
export class CorrectShipmentDto extends CancelShipmentDto {
  @IsOptional() @IsArray() @ArrayMaxSize(1000)
  @Matches(/^[0-9a-f-]{36}:[CONSERVADI]{6}:\d{4}-\d{2}-\d{2}$/, { each: true })
  confirmedExpirationKeys?: string[];
  @IsUUID() requestKey!: string;
  @IsOptional() @Transform(trimString) @IsString() @MaxLength(1000) observation?: string;
  @IsOptional() @IsIn(['CARREGADO', 'NAO_CARREGADO']) loadingStatus?: ShipmentLoadingStatus;
  @IsOptional() @Transform(trimString) @IsString() @MaxLength(20) vehiclePlate?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => CorrectShipmentItemDto)
  items!: CorrectShipmentItemDto[];
}
export class ShipmentQueryDto extends PaginationQueryDto {
  @IsOptional() @IsIn(['RECENT','OLDEST','STATUS']) sort?: 'RECENT' | 'OLDEST' | 'STATUS' = 'RECENT';
  @IsOptional() @IsString() @MaxLength(30) codigoMovimentacao?: string;
  @IsOptional() @IsIn(['pending','sent','history','updates','open']) view: 'pending' | 'sent' | 'history' | 'updates' | 'open' = 'pending';
  @IsOptional() @IsIn(['AGUARDANDO_RECEBIMENTO','EM_SEPARACAO','CONFIRMADO','RECUSADO','CANCELADO']) status?: ShipmentStatus;
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

export class AssemblyOptionsQueryDto extends PaginationQueryDto {
  @IsUUID() productId!: string;
  @IsOptional() @IsUUID() batchId?: string;
}
