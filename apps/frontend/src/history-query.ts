export function buildHistoryQuery(filters: Record<string, string>, page?: number): string {
  const params = new URLSearchParams(filters);
  if (page !== undefined) { params.set('page', String(page)); params.set('limit', '20'); }
  if (filters.dateFrom) params.set('dateFrom', new Date(`${filters.dateFrom}T00:00:00.000`).toISOString());
  else params.delete('dateFrom');
  if (filters.dateTo) params.set('dateTo', new Date(`${filters.dateTo}T23:59:59.999`).toISOString());
  else params.delete('dateTo');
  return params.toString();
}
