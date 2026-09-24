import { IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/pagination/pagination-query.dto';

export class ProductAuditQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  productId?: string;
}

export interface ProductAuditEntry {
  id: string;
  productId: string;
  action: string;
  username: string | null;
  createdAt: Date;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
}
