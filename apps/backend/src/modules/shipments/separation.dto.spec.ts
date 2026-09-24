import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SeparationDraftDto } from './shipment.dto';

describe('DTO da separacao imediata', () => {
  it('aceita zero e retornos inteiros positivos', async () => {
    const dto = plainToInstance(SeparationDraftDto, { items: [
      { shipmentItemId: randomUUID(), returnQuantity: 0 },
      { shipmentItemId: randomUUID(), returnQuantity: 12 },
    ] });
    expect(await validate(dto)).toHaveLength(0);
  });

  it.each([-1, 1.5])('rejeita retorno invalido %s', async (returnQuantity) => {
    const dto = plainToInstance(SeparationDraftDto, { items: [{ shipmentItemId: randomUUID(), returnQuantity }] });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });
});

