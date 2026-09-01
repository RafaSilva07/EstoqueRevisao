import { BatchCodeCodec, BatchCodeError } from './batch-code.codec';

describe('BatchCodeCodec', () => {
  const codec = new BatchCodeCodec();

  it.each([
    [0, 'C'], [1, 'O'], [2, 'N'], [3, 'S'], [4, 'E'],
    [5, 'R'], [6, 'V'], [7, 'A'], [8, 'D'], [9, 'I'],
  ])('codifica o digito %i como %s', (digit, letter) => {
    expect(codec.encodeDigit(digit)).toBe(letter);
    expect(codec.decodeCharacter(letter)).toBe(digit);
  });

  it('gera SOCDNV para 31/08/2026', () => {
    expect(codec.encode('2026-08-31')).toBe('SOCDNV');
  });

  it('decodifica SOCDNV como 31/08/2026', () => {
    expect(codec.decode('SOCDNV')).toBe('2026-08-31');
  });

  it('normaliza lote em letras minusculas', () => {
    expect(codec.resolve('socdnv')).toEqual({
      code: 'SOCDNV',
      manufacturingDate: '2026-08-31',
    });
  });

  it.each(['SOCBNV', 'SOC', 'SOCDNVC'])('rejeita lote invalido: %s', (code) => {
    expect(() => codec.decode(code)).toThrow(BatchCodeError);
  });

  it('rejeita data de fabricacao inexistente', () => {
    expect(() => codec.encode('2026-02-31')).toThrow(BatchCodeError);
    expect(() => codec.decode('SOCNNV')).toThrow(BatchCodeError);
  });

  it('rejeita divergencia entre lote e fabricacao simultaneos', () => {
    expect(() => codec.resolve('SOCDNV', '2026-08-30')).toThrow(
      expect.objectContaining({ code: 'BATCH_MANUFACTURING_MISMATCH' }),
    );
  });

  it('interpreta anos de dois digitos dentro da janela fixa 2000-2099', () => {
    expect(codec.decode('COCOCC')).toBe('2000-01-01');
    expect(codec.decode('SOONII')).toBe('2099-12-31');
  });
});
