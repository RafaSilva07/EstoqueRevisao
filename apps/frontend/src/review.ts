export const quantityUnits = (value: string | number): number => (
  Math.round(Number(value || 0) * 1_000_000)
);

export function calculateDistribution(
  quantity: string | number,
  distributions: Array<string | number>,
): { reviewed: number; distributed: number; difference: number } {
  const reviewed = quantityUnits(quantity);
  const distributed = distributions.reduce<number>(
    (total, value) => total + quantityUnits(value),
    0,
  );
  return { reviewed, distributed, difference: reviewed - distributed };
}
