import { describe, expect, it } from 'vitest';
import { calculateDistribution } from './review';

describe('distribuicao da revisao', () => {
  it('identifica distribuicao exata sem erro de ponto flutuante', () => {
    expect(calculateDistribution('0.3', ['0.1', '0.2'])).toEqual({
      reviewed: 300000,
      distributed: 300000,
      difference: 0,
    });
  });

  it('identifica quantidade ainda nao distribuida', () => {
    expect(calculateDistribution(600, [400, 150]).difference).toBe(50_000_000);
  });

  it('identifica distribuicao excedente', () => {
    expect(calculateDistribution(600, [400, 250]).difference).toBe(-50_000_000);
  });
});
