import { BadRequestException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { BatchCodeCodec } from './domain/batch-code.codec';
import { OperationalLotsService } from './operational-lots.service';

describe('OperationalLotsService', () => {
  const service = new OperationalLotsService({} as DataSource, new BatchCodeCodec());
  const civilDate = (value: Date): string => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  it('sugere validade em anos civis e ajusta 29 de fevereiro', () => {
    expect(service.suggestExpiration('2026-09-10', 3)).toBe('2029-09-10');
    expect(service.suggestExpiration('2024-02-29', 1)).toBe('2025-02-28');
    expect(service.suggestExpiration('2024-02-29', 4)).toBe('2028-02-29');
  });
  it.each([0, -1, 1.5, 10000])('rejeita prazo inválido %p', (years) => {
    expect(() => service.suggestExpiration('2026-09-10', years)).toThrow(BadRequestException);
  });
  it('rejeita divergência entre lote e fabricação antes de acessar banco', async () => {
    await expect(service.resolveInTransaction('product', {
      code: 'SOCDNV', manufacturingDate: '2026-08-30', expirationDate: '2029-08-31',
    }, 'user', [], {} as EntityManager)).rejects.toMatchObject({ response: { code: 'BATCH_MANUFACTURING_MISMATCH' } });
  });
  it('aceita fabricação de hoje e rejeita data futura digitada ou derivada do lote', async () => {
    const codec = new BatchCodeCodec();
    const repository = { findOneBy: jest.fn().mockResolvedValue({ active: true, shelfLifeYears: 3 }) };
    const checked = new OperationalLotsService({ manager: { getRepository: () => repository } } as unknown as DataSource, codec);
    const now = new Date();
    const today = civilDate(now);
    const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
    const future = civilDate(tomorrow);

    await expect(checked.preview({ productId: 'product', manufacturingDate: today })).resolves.toMatchObject({ manufacturingDate: today });
    await expect(checked.preview({ productId: 'product', manufacturingDate: future })).rejects.toMatchObject({ response: { code: 'FUTURE_MANUFACTURING_DATE' } });
    await expect(checked.preview({ productId: 'product', code: codec.encode(future) })).rejects.toMatchObject({ response: { code: 'FUTURE_MANUFACTURING_DATE' } });
  });
  it.each(['2026-08-30', '2027-02-30', 'invalid'])('rejeita validade inválida %s', async (expirationDate) => {
    await expect(service.resolveInTransaction('product', {
      code: 'SOCDNV', expirationDate,
    }, 'user', [], {} as EntityManager)).rejects.toThrow(BadRequestException);
  });
});
