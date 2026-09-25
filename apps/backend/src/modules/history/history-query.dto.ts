import { IsIn, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../shared/pagination/pagination-query.dto';

export class HistoryQueryDto extends PaginationQueryDto {
  @IsOptional() @IsIn(['ALL', 'OPEN', 'PENDING_PCP', 'DONE', 'CLOSED'])
  scope: 'ALL' | 'OPEN' | 'PENDING_PCP' | 'DONE' | 'CLOSED' = 'ALL';

  @IsOptional() @IsIn(['ALL', 'SHIPMENT', 'MOVEMENT'])
  kind: 'ALL' | 'SHIPMENT' | 'MOVEMENT' = 'ALL';

  @IsOptional() @IsIn(['ALL', 'INCOMING', 'OUTGOING', 'INTERNAL'])
  direction: 'ALL' | 'INCOMING' | 'OUTGOING' | 'INTERNAL' = 'ALL';

  @IsOptional() @IsIn(['RECENT', 'OLDEST'])
  sort: 'RECENT' | 'OLDEST' = 'RECENT';

  @IsOptional() @IsString() @MaxLength(100)
  search?: string;

  @IsOptional() @IsIn(['ALL', 'ENVIO', 'ENTRADA_EXTERNA', 'SAIDA_EXTERNA', 'TRANSFERENCIA_INTERNA', 'REVISAO'])
  type: 'ALL' | 'ENVIO' | 'ENTRADA_EXTERNA' | 'SAIDA_EXTERNA' | 'TRANSFERENCIA_INTERNA' | 'REVISAO' = 'ALL';

  @IsOptional() @IsISO8601({ strict: true }) dateFrom?: string;
  @IsOptional() @IsISO8601({ strict: true }) dateTo?: string;
}
