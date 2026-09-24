import { IsEnum, IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/pagination/pagination-query.dto';
import { MovementType } from '../domain/movement-type.enum';
import { MovementStatus } from '../domain/movement-status.enum';
import { PcpExecutionStatus } from '../../pcp/domain/pcp-execution-status.enum';

export class MovementQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsISO8601({ strict: true })
  dateFrom?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  dateTo?: string;

  @IsOptional()
  @IsEnum(MovementType)
  type?: MovementType;

  @IsOptional()
  @IsEnum(MovementStatus)
  status?: MovementStatus;

  @IsOptional()
  @IsEnum(PcpExecutionStatus)
  pcpStatus?: PcpExecutionStatus;

  @IsOptional()
  @IsUUID()
  originLocationId?: string;

  @IsOptional()
  @IsUUID()
  destinationLocationId?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;
}
