import { describe, expect, it } from 'vitest';
import { buildReportQuery, formatQuantities } from './report-utils';

describe('report utils', () => {
  it('monta paginacao e somente filtros preenchidos com periodo em ISO', () => {
    const query = new URLSearchParams(buildReportQuery({
      dateFrom: '2026-09-01', dateTo: '2026-09-08', product: 'Produto', batch: '',
    }, 3));

    expect(query.get('page')).toBe('3');
    expect(query.get('limit')).toBe('20');
    expect(query.get('dateFrom')).toBe(new Date('2026-09-01T00:00:00.000').toISOString());
    expect(query.get('dateTo')).toBe(new Date('2026-09-08T23:59:59.999').toISOString());
    expect(query.get('product')).toBe('Produto');
    expect(query.has('batch')).toBe(false);
  });

  it('formata totais recebidos da API sem combinar unidades', () => {
    expect(formatQuantities([])).toBe('0');
    expect(formatQuantities([{ unit: 'UN', quantity: 5 }, { unit: 'KG', quantity: 2 }]))
      .toBe('5 UN | 2 KG');
  });
});
