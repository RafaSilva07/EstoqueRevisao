import { describe, expect, it } from 'vitest';
import { calculateDistribution, isIntegerQuantity } from './review';

describe('distribuicao da revisao', () => {
  it('aceita somente quantidades inteiras', () => {
    expect(isIntegerQuantity('10')).toBe(true);
    expect(isIntegerQuantity('10.5')).toBe(false);
  });

  it('identifica quantidade ainda nao distribuida', () => {
    expect(calculateDistribution(600, [400, 150]).difference).toBe(50);
  });

  it('identifica distribuicao excedente', () => {
    expect(calculateDistribution(600, [400, 250]).difference).toBe(-50);
  });
});
