import { describe, expect, it } from 'vitest';
import { buildHistoryQuery } from './history-query';

describe('Filtros do histórico e exportação', () => {
  it('usa os mesmos limites do dia local na consulta e no CSV', () => {
    const filters = { dateFrom: '2026-09-01', dateTo: '2026-09-30', search: 'Produto; A', type: 'REVISAO', sort: 'OLDEST' };
    const list = new URLSearchParams(buildHistoryQuery(filters, 3));
    const csv = new URLSearchParams(buildHistoryQuery(filters));
    expect(csv.get('dateFrom')).toBe(new Date('2026-09-01T00:00:00.000').toISOString());
    expect(csv.get('dateTo')).toBe(new Date('2026-09-30T23:59:59.999').toISOString());
    expect(list.get('dateFrom')).toBe(csv.get('dateFrom'));
    expect(list.get('dateTo')).toBe(csv.get('dateTo'));
    expect(csv.get('search')).toBe('Produto; A');
    expect(list.get('page')).toBe('3');
    expect(csv.has('page')).toBe(false);
    expect(new URLSearchParams(buildHistoryQuery({ dateFrom: '', dateTo: '' })).has('dateFrom')).toBe(false);
  });
});
