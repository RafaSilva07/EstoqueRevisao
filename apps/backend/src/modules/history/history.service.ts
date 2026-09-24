import { ForbiddenException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuthenticatedUser } from '../auth/authenticated-user.interface';
import { PaginatedResult, paginate } from '../../shared/pagination/paginated-result.interface';
import { HistoryQueryDto } from './history-query.dto';

export interface HistoryItem {
  id: string;
  kind: 'SHIPMENT' | 'MOVEMENT';
  code: string | null;
  type: string;
  origin: string;
  destination: string;
  responsible: string;
  occurredAt: Date;
  status: string;
  scope: 'OPEN' | 'PENDING_PCP' | 'DONE' | 'CLOSED';
  itemCount: number;
}

@Injectable()
export class HistoryService {
  constructor(private readonly dataSource: DataSource) {}

  async list(query: HistoryQueryDto, user: AuthenticatedUser): Promise<PaginatedResult<HistoryItem>> {
    const canReadMovements = user.sector === 'PCP'
      ? user.permissions.includes('pcp.movements.read')
      : user.sector === 'REVISAO' && user.permissions.includes('movements.read');
    const canReadShipments = user.sector !== 'PCP' && user.permissions.includes('shipments.read');
    if (!canReadMovements && !canReadShipments) throw new ForbiddenException('Você não tem permissão para consultar o histórico.');

    const cte = `
      WITH entries AS (
        SELECT s.id, 'SHIPMENT'::text AS kind, s.codigo_movimentacao AS code,
          'ENVIO'::text AS type, s.origin_sector::text AS origin, s.destination_sector::text AS destination,
          author.username::text AS responsible, s.created_at AS occurred_at, s.status::text AS status,
          CASE WHEN s.status IN ('AGUARDANDO_RECEBIMENTO', 'EM_SEPARACAO') THEN 'OPEN'
            WHEN s.status IN ('RECUSADO', 'CANCELADO') THEN 'CLOSED'
            WHEN EXISTS (SELECT 1 FROM movements linked WHERE linked.shipment_id = s.id
              AND linked.status = 'EFETIVADA' AND linked.requires_pcp_execution
              AND linked.pcp_execution_status = 'PENDENTE') THEN 'PENDING_PCP'
            ELSE 'DONE' END::text AS scope,
          (SELECT count(*)::int FROM shipment_items si WHERE si.shipment_id = s.id) AS item_count
        FROM shipments s JOIN users author ON author.id = s.created_by_id
        WHERE $1::boolean AND (s.origin_sector = $2 OR s.destination_sector = $2)
          AND ($6 = '' OR s.codigo_movimentacao ILIKE '%' || $6 || '%'
            OR EXISTS (SELECT 1 FROM shipment_items search_item WHERE search_item.shipment_id = s.id
              AND (search_item.product_snapshot->>'code' ILIKE '%' || $6 || '%'
                OR search_item.product_snapshot->>'name' ILIKE '%' || $6 || '%')))
        UNION ALL
        SELECT m.id, 'MOVEMENT'::text AS kind, m.codigo_movimentacao AS code,
          m.type::text AS type, origin.name::text AS origin,
          COALESCE(destination.name, 'Múltiplos destinos')::text AS destination,
          author.username::text AS responsible, m.occurred_at AS occurred_at, m.status::text AS status,
          CASE WHEN m.status = 'CANCELADA' THEN 'CLOSED'
            WHEN m.requires_pcp_execution AND m.pcp_execution_status = 'PENDENTE' THEN 'PENDING_PCP'
            ELSE 'DONE' END::text AS scope,
          (SELECT count(*)::int FROM movement_items mi WHERE mi.movement_id = m.id) AS item_count
        FROM movements m JOIN users author ON author.id = m.responsible_user_id
          JOIN stock_locations origin ON origin.id = m.origin_location_id
          LEFT JOIN stock_locations destination ON destination.id = m.destination_location_id
        WHERE $3::boolean AND ($2 = 'PCP' OR m.shipment_id IS NULL)
          AND ($6 = '' OR m.codigo_movimentacao ILIKE '%' || $6 || '%' OR m.type ILIKE '%' || $6 || '%'
            OR EXISTS (SELECT 1 FROM movement_items search_item WHERE search_item.movement_id = m.id
              AND (search_item.product_snapshot->>'code' ILIKE '%' || $6 || '%'
                OR search_item.product_snapshot->>'name' ILIKE '%' || $6 || '%')))
      ), filtered AS (
        SELECT * FROM entries
        WHERE ($4 = 'ALL' OR scope = $4)
          AND ($5 = 'ALL' OR kind = $5)
          AND ($7 = 'ALL' OR type = $7)
          AND ($8::timestamptz IS NULL OR occurred_at >= $8)
          AND ($9::timestamptz IS NULL OR occurred_at <= $9)
      )`;
    const sql = `${cte}
      SELECT *, count(*) OVER ()::int AS total FROM filtered
      ORDER BY occurred_at ${query.sort === 'OLDEST' ? 'ASC' : 'DESC'}, id ${query.sort === 'OLDEST' ? 'ASC' : 'DESC'}
      LIMIT $10 OFFSET $11`;
    const parameters = [canReadShipments, user.sector, canReadMovements, query.scope, query.kind, query.search?.trim() ?? '', query.type ?? 'ALL', query.dateFrom ?? null, query.dateTo ?? null, query.limit, (query.page - 1) * query.limit];
    const rows: Array<Record<string, unknown>> = await this.dataSource.query(sql, parameters);
    const totalRows: Array<{ total: number }> = rows.length ? [] : await this.dataSource.query(
      `${cte} SELECT count(*)::int AS total FROM filtered`, parameters.slice(0, 9),
    );
    const total = rows.length ? Number(rows[0].total) : Number(totalRows[0]?.total ?? 0);
    return paginate(rows.map((row) => ({
      id: String(row.id), kind: row.kind as HistoryItem['kind'], code: row.code as string | null,
      type: String(row.type), origin: String(row.origin), destination: String(row.destination),
      responsible: String(row.responsible), occurredAt: row.occurred_at as Date,
      status: String(row.status), scope: row.scope as HistoryItem['scope'], itemCount: Number(row.item_count),
    })), total, query.page, query.limit);
  }
}
