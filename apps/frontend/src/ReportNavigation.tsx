export function ReportNavigation({
  current,
  onMovements,
  onReviews,
}: {
  current: 'movements' | 'reviews';
  onMovements: () => void;
  onReviews: () => void;
}) {
  return <nav className="report-tabs" aria-label="Relatorios">
    <button className={current === 'movements' ? 'current' : 'secondary'} onClick={onMovements}>Movimentacoes</button>
    <button className={current === 'reviews' ? 'current' : 'secondary'} onClick={onReviews}>Revisoes</button>
  </nav>;
}
