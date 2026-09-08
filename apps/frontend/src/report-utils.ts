import { QuantityByUnit } from './api';

export type ReportFilters = Record<string, string>;

export function buildReportQuery(filters: ReportFilters, page: number): string {
  const params = new URLSearchParams({ page: String(page), limit: '20' });
  Object.entries(filters).forEach(([key, value]) => {
    if (!value) return;
    if (key === 'dateFrom' || key === 'dateTo') {
      const time = key === 'dateFrom' ? '00:00:00.000' : '23:59:59.999';
      params.set(key, new Date(`${value}T${time}`).toISOString());
      return;
    }
    params.set(key, value);
  });
  return params.toString();
}

export function formatQuantities(values: QuantityByUnit[]): string {
  if (values.length === 0) return '0';
  return values.map(({ quantity, unit }) => `${quantity.toLocaleString('pt-BR')} ${unit}`).join(' | ');
}
