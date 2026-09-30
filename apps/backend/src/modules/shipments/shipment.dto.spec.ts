import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { AssemblyOptionsQueryDto, AvailableShipmentPositionsQueryDto, CreateShipmentDto, RefuseShipmentDto } from './shipment.dto';

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
  it('aceita apenas identificador válido para filtrar a data/lote da montagem', async () => {
    expect(await validate(plainToInstance(AssemblyOptionsQueryDto, { productId: randomUUID(), batchId: randomUUID() }))).toHaveLength(0);
    expect((await validate(plainToInstance(AssemblyOptionsQueryDto, { productId: randomUUID(), batchId: 'inválido' }))).length).toBeGreaterThan(0);
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
  it('valida estado do carregamento e normaliza a placa informada', async () => {
    const base = { requestKey: randomUUID(), destinationSector: 'REVISAO', items: [{ productId: randomUUID(), batchId: randomUUID(), quantity: 1 }] };
    const valid = plainToInstance(CreateShipmentDto, { ...base, loadingStatus: 'CARREGADO', vehiclePlate: '  abc1d23  ' });
    expect(await validate(valid)).toHaveLength(0);
    expect(valid.vehiclePlate).toBe('abc1d23');
    expect((await validate(plainToInstance(CreateShipmentDto, { ...base, loadingStatus: 'INDEFINIDO' }))).length).toBeGreaterThan(0);
    expect((await validate(plainToInstance(CreateShipmentDto, { ...base, vehiclePlate: 'x'.repeat(21) }))).length).toBeGreaterThan(0);
  });
  it('valida parcelas inteiras da montagem e rejeita origem inválida', async () => {
    const data = { requestKey: randomUUID(), destinationSector: 'EXPEDICAO', items: [{ productId: randomUUID(),
      quantity: 2, assembly: { packageProductId: randomUUID(), mixedDates: true,
        sources: [{ batchId: randomUUID(), stockLocationId: randomUUID(), quantity: 10 }] } }] };
    expect(await validate(plainToInstance(CreateShipmentDto, data))).toHaveLength(0);
    for (const badQuantity of [0, -1, 1.5]) {
      const invalid = structuredClone(data);
      invalid.items[0].assembly.sources[0].quantity = badQuantity;
      expect((await validate(plainToInstance(CreateShipmentDto, invalid))).length).toBeGreaterThan(0);
    }
    const empty = structuredClone(data);
    empty.items[0].assembly.sources = [];
    expect((await validate(plainToInstance(CreateShipmentDto, empty))).length).toBeGreaterThan(0);
  });
});
