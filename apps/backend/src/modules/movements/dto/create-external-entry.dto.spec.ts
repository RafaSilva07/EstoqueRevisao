import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateExternalEntryDto } from './create-external-entry.dto';
import { CreateInternalTransferDto } from './create-internal-transfer.dto';
import { CreateReviewDto } from './create-review.dto';

describe('Operational lot contracts', () => {
  const id = '70000000-0000-4000-8000-000000000001';
  const payload = { requestKey: id, originLocationId: id, destinationLocationId: id };
  const lot = { code: 'socdnv', manufacturingDate: '2026-08-31', expirationDate: '2029-08-31' };
  it('aceita entrada inline e normaliza CONSERVADI', async () => {
    const dto = plainToInstance(CreateExternalEntryDto, { ...payload, items: [{ productId: id, lot, quantity: 10 }] });
    expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).toHaveLength(0);
    expect(dto.items[0].lot?.code).toBe('SOCDNV');
  });
  it('aceita transferência com lote inline', async () => {
    const dto = plainToInstance(CreateInternalTransferDto, { ...payload, items: [{ productId: id, batchId: id, destinationLot: lot, quantity: 10 }] });
    expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).toHaveLength(0);
  });
  it('continua rejeitando troca de lote na revisão', async () => {
    const dto = plainToInstance(CreateReviewDto, { requestKey: id, items: [{
      productId: id, batchId: id, destinationLot: lot, quantity: 10,
      distributions: [{ destinationLocationId: id, quantity: 10 }],
    }] });
    expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).not.toHaveLength(0);
  });
  it.each([{}, { lot: { ...lot, expirationDate: '2027-02-30' } }, { lot: { ...lot, code: 'ABC123' } }])('rejeita lote ausente ou inválido', async (item) => {
    const dto = plainToInstance(CreateExternalEntryDto, { ...payload, items: [{ productId: id, quantity: 10, ...item }] });
    expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).not.toHaveLength(0);
  });
});
