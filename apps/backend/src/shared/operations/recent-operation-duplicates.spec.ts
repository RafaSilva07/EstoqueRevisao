import { ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateExternalEntryDto } from '../../modules/movements/dto/create-external-entry.dto';
import { CreateReviewDto } from '../../modules/movements/dto/create-review.dto';
import { CreateShipmentDto } from '../../modules/shipments/shipment.dto';
import { confirmRecentDuplicates, duplicateItems, DuplicateOperation } from './recent-operation-duplicates';

const uuid = '10000000-0000-4000-8000-000000000001';
const operation: DuplicateOperation = { kind: 'MOVEMENT', type: 'REVISAO', origin: uuid, destination: null, requestKey: uuid,
  items: [{ productId: uuid, batchId: uuid, quantity: 10, distributions: [{ destinationLocationId: uuid, quantity: 10 }] }] };

describe('aviso de operação recente idêntica', () => {
  const query = jest.fn<Promise<unknown[]>, [string, unknown[]?]>();
  const manager = { query } as unknown as EntityManager;
  const match = { id: uuid, code: 'REV-000001', createdAt: new Date(), responsible: 'Outro operador', status: 'EFETIVADA' };
  beforeEach(() => { query.mockReset(); query.mockResolvedValue([]); });
  async function warning(input = operation): Promise<{ details: { duplicateKeys: string[] } }> {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([match]);
    try { await confirmRecentDuplicates(manager, input); }
    catch (error) { expect(error).toBeInstanceOf(ConflictException); return (error as ConflictException).getResponse() as { details: { duplicateKeys: string[] } }; }
    throw new Error('O aviso era esperado');
  }
  it('avisa com código, responsável e instante, sem tratar a duplicidade como proibição definitiva', async () => {
    const response = await warning();
    expect(response).toMatchObject({ code: 'RECENT_DUPLICATE_CONFIRMATION_REQUIRED', details: { windowMinutes: 30, duplicates: [{ ...match, kind: 'MOVEMENT' }] } });
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([match]);
    await expect(confirmRecentDuplicates(manager, operation, response.details.duplicateKeys)).resolves.toEqual(response.details.duplicateKeys);
  });
  it('ignora ordem dos itens/distribuições e não modifica o DTO', () => {
    const input = { ...operation, items: [...operation.items, { ...operation.items[0], quantity: 7 }] };
    expect(duplicateItems(input)).toEqual(duplicateItems({ ...input, items: [...input.items].reverse() }));
    expect(input.items[0].quantity).toBe(10);
  });
  it('não reutiliza confirmação após mudar quantidade ou rota', async () => {
    const response = await warning();
    for (const changed of [{ ...operation, destination: uuid }, { ...operation, items: [{ ...operation.items[0], quantity: 11 }] }]) {
      query.mockResolvedValueOnce([]).mockResolvedValueOnce([match]);
      await expect(confirmRecentDuplicates(manager, changed, response.details.duplicateKeys)).rejects.toBeInstanceOf(ConflictException);
    }
  });
  it('uma nova operação concorrente ainda não apresentada exige outra conferência', async () => {
    const response = await warning();
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ ...match, id: '10000000-0000-4000-8000-000000000002' }]);
    await expect(confirmRecentDuplicates(manager, operation, response.details.duplicateKeys)).rejects.toBeInstanceOf(ConflictException);
  });
  it('usa a mesma transação, serialização e janela pela criação, não pela data informada', async () => {
    await confirmRecentDuplicates(manager, operation);
    expect(query.mock.calls[0][0]).toContain('pg_advisory_xact_lock');
    expect(query.mock.calls[1][0]).toContain('o.created_at >= clock_timestamp()');
    expect(query.mock.calls[1][0]).toContain("o.status='EFETIVADA'");
    expect(query.mock.calls[1][1]!.at(-1)).toBe(30);
  });
  it('montagem compara todas as parcelas sem depender da primeira origem ou de dados de apresentação', () => {
    const a = { batchId: uuid, stockLocationId: uuid, quantity: 12 };
    const b = { ...a, stockLocationId: '10000000-0000-4000-8000-000000000002' };
    const input: DuplicateOperation = { ...operation, kind: 'SHIPMENT', type: 'MONTAGEM', origin: 'REVISAO', destination: 'EXPEDICAO', items: [{ ...operation.items[0], quantity: 24, stockLocationId: a.stockLocationId,
      assembly: { packageProductId: uuid, packageQuantity: 2, unitsPerPackage: 12, mixedDates: false, sources: [a, b] } }] };
    expect(duplicateItems(input)).toEqual(duplicateItems({ ...input, items: [{ ...input.items[0], stockLocationId: b.stockLocationId, assembly: { ...input.items[0].assembly!, sources: [b, a] } }] }));
    expect(duplicateItems(input)).not.toEqual(duplicateItems({ ...input, items: [{ ...input.items[0], assembly: { ...input.items[0].assembly!, packageQuantity: 3 } }] }));
  });
  it.each([CreateExternalEntryDto, CreateReviewDto, CreateShipmentDto])('valida as chaves de confirmação no DTO %p', async (Dto) => {
    const valid = plainToInstance<object, unknown>(Dto, { confirmedDuplicateKeys: [`MOVEMENT:${uuid}:${'a'.repeat(64)}`] });
    const invalid = plainToInstance<object, unknown>(Dto, { confirmedDuplicateKeys: true });
    expect((await validate(valid)).filter((error) => error.property === 'confirmedDuplicateKeys')).toHaveLength(0);
    expect((await validate(invalid)).some((error) => error.property === 'confirmedDuplicateKeys')).toBe(true);
  });
});
