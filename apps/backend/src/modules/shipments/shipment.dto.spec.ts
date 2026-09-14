import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { CreateShipmentDto, RefuseShipmentDto } from './shipment.dto';

describe('DTOs de envios', () => {
  it.each([0, -1, 1.5])('rejeita quantidade inválida %s', async (quantity) => {
    const dto = plainToInstance(CreateShipmentDto, { requestKey: randomUUID(), destinationSector:'REVISAO', items:[{productId:randomUUID(),batchId:randomUUID(),quantity}] });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });
  it('rejeita setor de origem injetado e exige motivo não vazio', async () => {
    const dto = plainToInstance(CreateShipmentDto, { requestKey: randomUUID(), originSector:'REVISAO', destinationSector:'REVISAO', items:[{productId:randomUUID(),batchId:randomUUID(),quantity:1}] });
    expect((await validate(dto,{whitelist:true,forbidNonWhitelisted:true})).some((error) => error.property === 'originSector')).toBe(true);
    expect((await validate(plainToInstance(RefuseShipmentDto,{reason:'  '}))).length).toBeGreaterThan(0);
  });
});
