import { BadRequestException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { BatchCodeCodec } from './domain/batch-code.codec';
import { OperationalLotsService } from './operational-lots.service';

describe('OperationalLotsService', () => {
  const service = new OperationalLotsService({} as DataSource, new BatchCodeCodec());
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
  it.each(['2026-08-30', '2027-02-30', 'invalid'])('rejeita validade inválida %s', async (expirationDate) => {
    await expect(service.resolveInTransaction('product', {
      code: 'SOCDNV', expirationDate,
    }, 'user', [], {} as EntityManager)).rejects.toThrow(BadRequestException);
  });
});
