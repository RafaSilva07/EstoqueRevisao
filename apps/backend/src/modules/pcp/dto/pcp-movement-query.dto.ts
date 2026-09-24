import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/pagination/pagination-query.dto';
import { MovementType } from '../../movements/domain/movement-type.enum';
import { PcpExecutionStatus } from '../domain/pcp-execution-status.enum';

export class PcpMovementQueryDto extends PaginationQueryDto {
  @IsOptional() @IsISO8601({ strict: true }) dateFrom?: string;
  @IsOptional() @IsISO8601({ strict: true }) dateTo?: string;
  @IsOptional() @IsIn(['CONCLUIDA', 'CANCELADA']) operationalStatus?: 'CONCLUIDA' | 'CANCELADA';
  @IsOptional() @IsEnum(PcpExecutionStatus) pcpStatus?: PcpExecutionStatus;
  @IsOptional() @IsEnum(MovementType) type?: MovementType;
  @IsOptional() @IsUUID() originLocationId?: string;
  @IsOptional() @IsUUID() destinationLocationId?: string;
  @IsOptional() @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsIn(['ASC', 'DESC', 'PCP_STATUS']) sort: 'ASC' | 'DESC' | 'PCP_STATUS' = 'ASC';
}
