import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { AvailableShipmentPositionsQueryDto, CreateShipmentDto, RefuseShipmentDto } from './shipment.dto';

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
  it('valida os filtros de posições disponíveis', async () => {
    const valid = plainToInstance(AvailableShipmentPositionsQueryDto, { productId: randomUUID(), batchCode: ' SOC ', page: 1, limit: 20 });
    expect(await validate(valid)).toHaveLength(0);
    expect(valid.batchCode).toBe('SOC');
    const invalid = plainToInstance(AvailableShipmentPositionsQueryDto, { productId: randomUUID(), manufacturingDate: '31/08/2026' });
    expect((await validate(invalid)).length).toBeGreaterThan(0);
  });
  it('normaliza e limita observações gerais e por produto', async () => {
    const valid = plainToInstance(CreateShipmentDto, {
      requestKey: randomUUID(), destinationSector: 'REVISAO', observation: '  Conferir lacre  ',
      items: [{ productId: randomUUID(), batchId: randomUUID(), quantity: 1, observation: '  Caixa amassada  ' }],
    });
    expect(await validate(valid)).toHaveLength(0);
    expect(valid.observation).toBe('Conferir lacre');
    expect(valid.items[0].observation).toBe('Caixa amassada');
    const invalid = plainToInstance(CreateShipmentDto, {
      requestKey: randomUUID(), destinationSector: 'REVISAO', observation: 'x'.repeat(1001),
      items: [{ productId: randomUUID(), batchId: randomUUID(), quantity: 1, observation: 'x'.repeat(1001) }],
    });
    expect((await validate(invalid)).length).toBeGreaterThan(0);
  });
});
