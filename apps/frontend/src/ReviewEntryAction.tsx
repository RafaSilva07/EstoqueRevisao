import { useOperationalActions } from './operational-actions';

export function ReviewEntryAction({ productId, batchId, eligible }: { productId: string; batchId: string; eligible: boolean }) {
  const actions = useOperationalActions();
  if (!eligible || !actions.review) return null;
  return <button type="button" className="secondary" onClick={() => actions.review?.({ productId, batchId })}>Revisar produto</button>;
}
