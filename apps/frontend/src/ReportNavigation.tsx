export function ReportNavigation({
  current,
  onMovements,
  onReviews,
  onStock,
}: {
  current: 'movements' | 'reviews' | 'stock';
  onMovements?: () => void;
  onReviews?: () => void;
  onStock?: () => void;
}) {
  return <nav className="report-tabs" aria-label="Relatorios">
    {onMovements && <button className={current === 'movements' ? 'current' : 'secondary'} onClick={onMovements}>Movimentacoes</button>}
    {onReviews && <button className={current === 'reviews' ? 'current' : 'secondary'} onClick={onReviews}>Revisoes</button>}
    {onStock && <button className={current === 'stock' ? 'current' : 'secondary'} onClick={onStock}>Estoque e validades</button>}
  </nav>;
}
