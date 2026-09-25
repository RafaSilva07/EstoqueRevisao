import { BadRequestException } from '@nestjs/common';
import { validatePhotoCounts } from './shipment-photo-counts';

describe('Limites de fotos por produto', () => {
  it('mantém um arquivo por item em payloads antigos com mínimo um', () => {
    expect(validatePhotoCounts([{}, {}], 2, { minimum: 1, maximum: 5 })).toEqual([1, 1]);
  });

  it('aceita múltiplas fotos por item na ordem do payload', () => {
    expect(validatePhotoCounts([{ photoCount: 2 }, { photoCount: 3 }], 5, { minimum: 2, maximum: 5 })).toEqual([2, 3]);
  });

  it('rejeita quantidade menor que o mínimo, maior que o máximo e arquivos faltantes', () => {
    for (const [items, fileCount] of [
      [[{ photoCount: 1 }], 1],
      [[{ photoCount: 6 }], 6],
      [[{ photoCount: 2 }], 1],
    ] as const) {
      expect(() => validatePhotoCounts([...items], fileCount, { minimum: 2, maximum: 5 })).toThrow(BadRequestException);
    }
  });

  it('rejeita mais de 100 fotos no total', () => {
    expect(() => validatePhotoCounts(Array.from({ length: 21 }, () => ({ photoCount: 5 })), 105, { minimum: 1, maximum: 5 })).toThrow(BadRequestException);
  });
});
