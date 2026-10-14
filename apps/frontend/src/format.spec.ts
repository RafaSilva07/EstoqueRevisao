import { describe, expect, it } from 'vitest';
import { formatPendingAge } from './format';

describe('tempo da pendência mais antiga', () => {
  const now = Date.parse('2026-10-14T15:00:00-03:00');
  it.each([
    [0, 'há menos de 1 minuto'], [60_000, 'há 1 minuto'], [59 * 60_000, 'há 59 minutos'],
    [3_600_000, 'há 1 hora'], [23 * 3_600_000, 'há 23 horas'],
    [24 * 3_600_000, 'há 1 dia'], [5 * 24 * 3_600_000, 'há 5 dias'],
  ])('formata %s milissegundos decorridos', (elapsed, expected) => {
    expect(formatPendingAge(new Date(now - elapsed).toISOString(), now)).toBe(expected);
  });
  it('compara instantes com fusos diferentes sem mudar a idade', () => {
    expect(formatPendingAge('2026-10-13T18:00:00Z', now)).toBe('há 1 dia');
    expect(formatPendingAge('2026-10-13T15:00:00-03:00', now)).toBe('há 1 dia');
    expect(formatPendingAge('data inválida', now)).toBeNull();
    expect(formatPendingAge(new Date(now + 60_000).toISOString(), now)).toBe('há menos de 1 minuto');
  });
});
