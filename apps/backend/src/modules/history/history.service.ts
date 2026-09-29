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
  direction: 'INCOMING' | 'OUTGOING' | 'INTERNAL';
  parentShipmentId: string | null;
  parentCode: string | null;
  groupId?: string;
  groupCode?: string | null;
  recordId?: string;
  groupItemCount?: number;
  productCode?: string | null;
  productName?: string | null;
  productUnit?: string | null;
  batchCode?: string | null;
  manufacturingDate?: string | null;
  quantity?: number | null;
  pcpExecutionStatus?: string | null;
  sentBy?: string | null;
  receivedBy?: string | null;
  pcpExecutedBy?: string | null;
  pcpRequired?: boolean;
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
          (SELECT count(*)::int FROM shipment_items si WHERE si.shipment_id = s.id) AS item_count,
          CASE WHEN s.destination_sector = $2 THEN 'INCOMING' ELSE 'OUTGOING' END::text AS direction,
          s.source_shipment_id AS parent_shipment_id, parent.codigo_movimentacao AS parent_code
        FROM shipments s JOIN users author ON author.id = s.created_by_id
          LEFT JOIN shipments parent ON parent.id = s.source_shipment_id
        WHERE $1::boolean AND (s.origin_sector = $2 OR s.destination_sector = $2)
          AND (NOT $3::boolean OR s.separation_completed_at IS NULL OR NOT EXISTS (
            SELECT 1 FROM shipments returned WHERE returned.source_shipment_id = s.id AND returned.shipment_kind = 'RETORNO_IMEDIATO'))
        UNION ALL
        SELECT m.id, 'MOVEMENT'::text AS kind, m.codigo_movimentacao AS code,
          m.type::text AS type, origin.name::text AS origin,
          COALESCE(destination.name, 'Múltiplos destinos')::text AS destination,
          author.username::text AS responsible, m.occurred_at AS occurred_at, m.status::text AS status,
          CASE WHEN m.status = 'CANCELADA' THEN 'CLOSED'
            WHEN m.requires_pcp_execution AND m.pcp_execution_status = 'PENDENTE' THEN 'PENDING_PCP'
            ELSE 'DONE' END::text AS scope,
          (SELECT count(*)::int FROM movement_items mi WHERE mi.movement_id = m.id) AS item_count,
          CASE WHEN linked_shipment.id IS NOT NULL THEN
            CASE WHEN linked_shipment.destination_sector = $2 THEN 'INCOMING' ELSE 'OUTGOING' END
            WHEN m.type = 'ENTRADA_EXTERNA' THEN 'INCOMING'
            WHEN m.type = 'SAIDA_EXTERNA' THEN 'OUTGOING'
            ELSE 'INTERNAL' END::text AS direction,
          m.shipment_id AS parent_shipment_id, linked_shipment.codigo_movimentacao AS parent_code
        FROM movements m JOIN users author ON author.id = m.responsible_user_id
          JOIN stock_locations origin ON origin.id = m.origin_location_id
          LEFT JOIN stock_locations destination ON destination.id = m.destination_location_id
          LEFT JOIN shipments linked_shipment ON linked_shipment.id = m.shipment_id
        WHERE $3::boolean AND ($2 = 'PCP' OR m.shipment_id IS NULL OR (
          linked_shipment.separation_completed_at IS NOT NULL AND EXISTS (
            SELECT 1 FROM shipments returned WHERE returned.source_shipment_id = linked_shipment.id AND returned.shipment_kind = 'RETORNO_IMEDIATO')))
      ), records AS (
        SELECT item.id, entry.kind, item.codigo_registro AS code, entry.type, entry.origin,
          entry.destination, entry.responsible, entry.occurred_at, entry.status,
          CASE WHEN entry.scope IN ('OPEN', 'CLOSED') THEN entry.scope
            WHEN linked_item.id IS NOT NULL AND linked_movement.requires_pcp_execution
              AND linked_item.pcp_execution_status = 'PENDENTE' THEN 'PENDING_PCP'
            ELSE 'DONE' END::text AS scope,
          1 AS item_count, entry.direction, entry.parent_shipment_id, entry.parent_code,
          entry.id AS group_id, entry.code AS group_code, entry.item_count AS group_item_count,
          item.record_ordinal,
          item.product_snapshot->>'code' AS product_code, item.product_snapshot->>'name' AS product_name,
          item.product_snapshot->>'defaultUnit' AS product_unit, batch.code AS batch_code,
          item.quantity, linked_item.pcp_execution_status,
          batch.manufacturing_date::text AS manufacturing_date,
          entry.responsible AS sent_by,
          CASE WHEN shipment.status IN ('CONFIRMADO', 'EM_SEPARACAO')
            THEN COALESCE(receiver.username, early_receiver.username) ELSE NULL END AS received_by,
          pcp_user.username AS pcp_executed_by,
          COALESCE(linked_movement.requires_pcp_execution, shipment.shipment_kind <> 'RETORNO_IMEDIATO') AS pcp_required
        FROM entries entry JOIN shipment_items item ON item.shipment_id = entry.id
          JOIN batches batch ON batch.id = item.batch_id
          JOIN shipments shipment ON shipment.id = item.shipment_id
          LEFT JOIN users receiver ON receiver.id = shipment.decided_by_id
          LEFT JOIN users early_receiver ON early_receiver.id = shipment.received_by_id
          LEFT JOIN movement_items linked_item ON linked_item.shipment_item_id = item.id
          LEFT JOIN movements linked_movement ON linked_movement.id = linked_item.movement_id
          LEFT JOIN users pcp_user ON pcp_user.id = linked_item.pcp_executed_by_user_id
        WHERE entry.kind = 'SHIPMENT'
        UNION ALL
        SELECT item.id, entry.kind, item.codigo_registro AS code, entry.type, entry.origin,
          COALESCE((SELECT string_agg(DISTINCT target.name, ' · ' ORDER BY target.name)
            FROM movement_item_distributions distribution JOIN stock_locations target
              ON target.id = distribution.destination_location_id
            WHERE distribution.movement_item_id = item.id), entry.destination) AS destination,
          entry.responsible, entry.occurred_at, entry.status,
          CASE WHEN entry.status = 'CANCELADA' THEN 'CLOSED'
            WHEN movement.requires_pcp_execution AND item.pcp_execution_status = 'PENDENTE' THEN 'PENDING_PCP'
            ELSE 'DONE' END::text AS scope,
          1 AS item_count, entry.direction, entry.parent_shipment_id, entry.parent_code,
          entry.id AS group_id, entry.code AS group_code, entry.item_count AS group_item_count,
          item.record_ordinal,
          COALESCE(item.product_snapshot->>'code', product.code) AS product_code,
          COALESCE(item.product_snapshot->>'name', product.name) AS product_name,
          COALESCE(item.product_snapshot->>'defaultUnit', product.default_unit) AS product_unit,
          batch.code AS batch_code, item.quantity, item.pcp_execution_status,
          batch.manufacturing_date::text AS manufacturing_date,
          COALESCE(sender.username, entry.responsible) AS sent_by,
          COALESCE(receiver.username, early_receiver.username) AS received_by,
          pcp_user.username AS pcp_executed_by,
          movement.requires_pcp_execution AS pcp_required
        FROM entries entry JOIN movement_items item ON item.movement_id = entry.id
          JOIN movements movement ON movement.id = item.movement_id
          JOIN products product ON product.id = item.product_id
          JOIN batches batch ON batch.id = item.batch_id
          LEFT JOIN shipments shipment ON shipment.id = movement.shipment_id
          LEFT JOIN users sender ON sender.id = shipment.created_by_id
          LEFT JOIN users receiver ON receiver.id = shipment.decided_by_id
          LEFT JOIN users early_receiver ON early_receiver.id = shipment.received_by_id
          LEFT JOIN users pcp_user ON pcp_user.id = item.pcp_executed_by_user_id
        WHERE entry.kind = 'MOVEMENT'
      ), filtered AS (
        SELECT * FROM ${query.view === 'GROUP' ? 'entries' : 'records'} source
        WHERE ($4 = 'ALL' OR scope = $4)
          AND ($5 = 'ALL' OR kind = $5)
          AND ($7 = 'ALL' OR type = $7)
          AND ($8::timestamptz IS NULL OR occurred_at >= $8)
          AND ($9::timestamptz IS NULL OR occurred_at <= $9)
          AND ($10 = 'ALL' OR direction = $10)
          AND ($6 = '' OR source.code ILIKE '%' || $6 || '%'
            ${query.view === 'GROUP' ? `OR source.parent_code ILIKE '%' || $6 || '%'
              OR source.type ILIKE '%' || $6 || '%'
              OR EXISTS (SELECT 1 FROM shipment_items searched_shipment WHERE source.kind = 'SHIPMENT'
                AND searched_shipment.shipment_id = source.id AND
                (searched_shipment.codigo_registro ILIKE '%' || $6 || '%'
                  OR searched_shipment.product_snapshot->>'code' ILIKE '%' || $6 || '%'
                  OR searched_shipment.product_snapshot->>'name' ILIKE '%' || $6 || '%'))
              OR EXISTS (SELECT 1 FROM movement_items searched_movement WHERE source.kind = 'MOVEMENT'
                AND searched_movement.movement_id = source.id AND
                (searched_movement.codigo_registro ILIKE '%' || $6 || '%'
                  OR searched_movement.product_snapshot->>'code' ILIKE '%' || $6 || '%'
                  OR searched_movement.product_snapshot->>'name' ILIKE '%' || $6 || '%'))`
              : `OR source.group_code ILIKE '%' || $6 || '%'
                OR source.parent_code ILIKE '%' || $6 || '%'
                OR source.product_code ILIKE '%' || $6 || '%'
                OR source.product_name ILIKE '%' || $6 || '%'`})
      )`;
    const sql = `${cte}
      SELECT *, count(*) OVER ()::int AS total FROM filtered
      ORDER BY occurred_at ${query.sort === 'OLDEST' ? 'ASC' : 'DESC'},
        ${query.view === 'GROUP' ? `id ${query.sort === 'OLDEST' ? 'ASC' : 'DESC'}`
          : `group_id ${query.sort === 'OLDEST' ? 'ASC' : 'DESC'}, record_ordinal ${query.sort === 'OLDEST' ? 'ASC' : 'DESC'}, id ${query.sort === 'OLDEST' ? 'ASC' : 'DESC'}`}
      LIMIT $11 OFFSET $12`;
    const parameters = [canReadShipments, user.sector, canReadMovements, query.scope, query.kind, query.search?.trim() ?? '', query.type ?? 'ALL', query.dateFrom ?? null, query.dateTo ?? null, query.direction ?? 'ALL', query.limit, (query.page - 1) * query.limit];
    const rows: Array<Record<string, unknown>> = await this.dataSource.query(sql, parameters);
    const totalRows: Array<{ total: number }> = rows.length ? [] : await this.dataSource.query(
      `${cte} SELECT count(*)::int AS total FROM filtered`, parameters.slice(0, 10),
    );
    const total = rows.length ? Number(rows[0].total) : Number(totalRows[0]?.total ?? 0);
    return paginate(rows.map((row) => ({
      id: String(row.id), kind: row.kind as HistoryItem['kind'], code: row.code as string | null,
      type: String(row.type), origin: String(row.origin), destination: String(row.destination),
      responsible: String(row.responsible), occurredAt: row.occurred_at as Date,
      status: String(row.status), scope: row.scope as HistoryItem['scope'], itemCount: Number(row.item_count),
      direction: row.direction as HistoryItem['direction'], parentShipmentId: row.parent_shipment_id as string | null,
      parentCode: row.parent_code as string | null,
      ...(query.view === 'RECORD' ? {
        groupId: String(row.group_id), groupCode: row.group_code as string | null,
        recordId: String(row.id), groupItemCount: Number(row.group_item_count),
        productCode: row.product_code as string | null, productName: row.product_name as string | null,
        productUnit: row.product_unit as string | null, batchCode: row.batch_code as string | null,
        quantity: Number(row.quantity), pcpExecutionStatus: row.pcp_execution_status as string | null,
        manufacturingDate: row.manufacturing_date as string | null,
        sentBy: row.sent_by as string | null, receivedBy: row.received_by as string | null,
        pcpExecutedBy: row.pcp_executed_by as string | null, pcpRequired: Boolean(row.pcp_required),
      } : {}),
    })), total, query.page, query.limit);
  }
}
