import { ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { EntityManager } from 'typeorm';
import { recentDuplicateMinutes } from '../../modules/settings/recent-duplicate-window';

interface Distribution { destinationLocationId: string; quantity: number }
interface AssemblySource { batchId: string; stockLocationId: string; quantity: number }
interface DuplicateItem {
  productId: string;
  batchId: string;
  quantity: number;
  destinationBatchId?: string | null;
  outputProductId?: string | null;
  unitsPerPackage?: number | null;
  distributions?: Distribution[];
  stockLocationId?: string | null;
  assembly?: {
    packageProductId: string; packageQuantity: number; unitsPerPackage: number;
    mixedDates: boolean; sources: AssemblySource[];
  } | null;
}
export interface DuplicateOperation {
  kind: 'MOVEMENT' | 'SHIPMENT';
  type: string;
  origin: string;
  destination: string | null;
  requestKey: string;
  items: DuplicateItem[];
}
interface DuplicateMatch {
  id: string; code: string | null; createdAt: Date; responsible: string; status: string;
}
const id = (value?: string | null): string | null => value?.toLowerCase() ?? null;
const ordered = <T>(values: T[]): T[] => values.sort((a, b) => {
  const left = JSON.stringify(a); const right = JSON.stringify(b);
  return left < right ? -1 : left > right ? 1 : 0;
});

export function duplicateItems(operation: DuplicateOperation): Record<string, unknown>[] {
  return ordered(operation.items.map((item) => operation.kind === 'MOVEMENT' ? {
    productId: id(item.productId), batchId: id(item.batchId), quantity: item.quantity,
    destinationBatchId: id(item.destinationBatchId), outputProductId: id(item.outputProductId),
    unitsPerPackage: item.unitsPerPackage ?? null,
    distributions: [...(item.distributions ?? [])].map((part) => ({ destinationLocationId: id(part.destinationLocationId), quantity: part.quantity }))
      .sort((a, b) => a.destinationLocationId!.localeCompare(b.destinationLocationId!)),
  } : {
    productId: id(item.productId), batchId: item.assembly ? null : id(item.batchId),
    stockLocationId: item.assembly ? null : id(item.stockLocationId), quantity: item.quantity,
    assembly: item.assembly ? {
      packageProductId: id(item.assembly.packageProductId), packageQuantity: item.assembly.packageQuantity,
      unitsPerPackage: item.assembly.unitsPerPackage, mixedDates: item.assembly.mixedDates,
      sources: item.assembly.sources.map((source) => ({ batchId: id(source.batchId), stockLocationId: id(source.stockLocationId), quantity: source.quantity }))
        .sort((a, b) => `${a.batchId}:${a.stockLocationId}`.localeCompare(`${b.batchId}:${b.stockLocationId}`)),
    } : null,
  }));
}

// Compare immutable operational data, not photos, notes, author, order or the retry key.
// The same manager/transaction is required: a warning must roll back lots, stock and audit.
export async function confirmRecentDuplicates(
  manager: EntityManager, operation: DuplicateOperation, confirmedKeys: string[] = [],
): Promise<string[]> {
  const items = duplicateItems(operation);
  const fingerprint = createHash('sha256').update(JSON.stringify([
    operation.kind, operation.type, id(operation.origin), id(operation.destination), items,
  ])).digest('hex');
  // Identical concurrent operations wait here, then see the first committed operation.
  await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`recent-operation:${fingerprint}`]);
  const windowMinutes = await recentDuplicateMinutes(manager);
  const movement = operation.kind === 'MOVEMENT';
  const itemSql = movement ? `
    SELECT jsonb_build_object(
      'productId', i.product_id, 'batchId', i.batch_id, 'quantity', i.quantity,
      'destinationBatchId', i.destination_batch_id, 'outputProductId', i.output_product_id,
      'unitsPerPackage', i.units_per_package,
      'distributions', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'destinationLocationId', d.destination_location_id, 'quantity', d.quantity
      ) ORDER BY d.destination_location_id) FROM movement_item_distributions d WHERE d.movement_item_id=i.id), '[]'::jsonb)
    ) AS value FROM movement_items i WHERE i.movement_id=o.id` : `
    SELECT jsonb_build_object(
      'productId', i.product_id, 'batchId', CASE WHEN i.assembly IS NULL THEN i.batch_id ELSE NULL END,
      'stockLocationId', CASE WHEN i.assembly IS NULL THEN i.stock_location_id ELSE NULL END,
      'quantity', i.quantity, 'assembly', CASE WHEN i.assembly IS NULL THEN NULL ELSE jsonb_build_object(
        'packageProductId', i.assembly->'packageProductId', 'packageQuantity', i.assembly->'packageQuantity',
        'unitsPerPackage', i.assembly->'unitsPerPackage', 'mixedDates', i.assembly->'mixedDates',
        'sources', (SELECT jsonb_agg(jsonb_build_object(
          'batchId', s->'batchId', 'stockLocationId', s->'stockLocationId', 'quantity', s->'quantity'
        ) ORDER BY s->>'batchId', s->>'stockLocationId') FROM jsonb_array_elements(i.assembly->'sources') s)
      ) END
    ) AS value FROM shipment_items i WHERE i.shipment_id=o.id`;
  const matches = await manager.query<DuplicateMatch[]>(`
    SELECT o.id, o.codigo_movimentacao AS code, o.created_at AS "createdAt", u.username AS responsible, o.status
    FROM ${movement ? 'movements' : 'shipments'} o
    JOIN users u ON u.id=o.${movement ? 'responsible_user_id' : 'created_by_id'}
    WHERE ${movement ? "o.type=$1 AND o.origin_location_id=$2::uuid AND o.destination_location_id IS NOT DISTINCT FROM $3::uuid AND o.status='EFETIVADA'"
      : "o.shipment_kind=$1 AND o.origin_sector=$2 AND o.destination_sector=$3 AND o.status IN ('AGUARDANDO_RECEBIMENTO','EM_SEPARACAO','CONFIRMADO')"}
      AND o.request_key<>$5::uuid
      AND o.created_at >= clock_timestamp() - $6 * interval '1 minute'
      AND (SELECT jsonb_agg(value ORDER BY value::text) FROM (${itemSql}) actual)
        = (SELECT jsonb_agg(value ORDER BY value::text) FROM jsonb_array_elements($4::jsonb) expected(value))
    ORDER BY o.created_at DESC, o.id DESC LIMIT 5
  `, [operation.type, operation.origin, operation.destination, JSON.stringify(items), operation.requestKey, windowMinutes]);
  const keys = matches.map((match) => `${operation.kind}:${match.id}:${fingerprint}`);
  if (keys.some((key) => !confirmedKeys.includes(key))) {
    throw new ConflictException({
      code: 'RECENT_DUPLICATE_CONFIRMATION_REQUIRED',
      message: `Já existe uma operação com os mesmos produtos, lotes, quantidades e rota nos últimos ${windowMinutes} minutos. Confira antes de continuar.`,
      details: {
        duplicateKeys: keys, windowMinutes,
        duplicates: matches.map((match) => ({ ...match, kind: operation.kind })),
      },
    });
  }
  return keys;
}
