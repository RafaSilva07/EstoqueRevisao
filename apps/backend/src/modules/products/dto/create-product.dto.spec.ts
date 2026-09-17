import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProductDto } from './create-product.dto';

describe('Unidades no cadastro de produtos', () => {
  const base = { code: 'TEST', name: 'Produto', defaultUnit: 'UN', unitWeightGrams: 350, shelfLifeYears: 3 };
  it('aceita apenas tipos definidos em novos cadastros', async () => {
    for (const defaultUnit of ['UN', 'FD', 'CX']) expect(await validate(plainToInstance(CreateProductDto, { ...base, defaultUnit }))).toHaveLength(0);
    expect(await validate(plainToInstance(CreateProductDto, { ...base, defaultUnit: 'INVENTADO' }))).not.toHaveLength(0);
  });
  it('rejeita fatores fracionários, negativos, zero e vínculos repetidos', async () => {
    for (const unitsPerPackage of [0, -1, 1.5]) expect(await validate(plainToInstance(CreateProductDto, { ...base, defaultUnit: 'CX', unitsPerPackage }))).not.toHaveLength(0);
    const id = '60000000-0000-4000-8000-000000000001';
    expect(await validate(plainToInstance(CreateProductDto, { ...base, unitProductIds: [id, id] }))).not.toHaveLength(0);
  });
  it('valida gramatura como gramas inteiras e positivas quando informada', async () => {
    for (const unitWeightGrams of [0, -1, 1.5]) expect(await validate(plainToInstance(CreateProductDto, { ...base, unitWeightGrams }))).not.toHaveLength(0);
  });
});
