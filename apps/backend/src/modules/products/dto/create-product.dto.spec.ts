import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProductDto } from './create-product.dto';
import { UpdateProductDto } from './update-product.dto';

describe('Unidades no cadastro de produtos', () => {
  const base = { code: '123456', name: 'Produto', defaultUnit: 'UN', unitWeightGrams: 350, shelfLifeYears: 3 };
  it('aceita somente 6 dígitos com sufixo opcional de ponto e 2 dígitos', async () => {
    for (const code of ['000000', '123456', '000000.00', '123456.78']) {
      expect(await validate(plainToInstance(CreateProductDto, { ...base, code }))).toHaveLength(0);
    }
    for (const code of ['12345', '1234567', '123456.', '123456.7', '123456.789', 'ABCDEF', '12A456', '123456-78']) {
      expect(await validate(plainToInstance(CreateProductDto, { ...base, code }))).not.toHaveLength(0);
    }
  });
  it('aplica o mesmo formato quando o código é alterado e permite atualizar outros campos', async () => {
    expect(await validate(plainToInstance(UpdateProductDto, { code: '12345' }))).not.toHaveLength(0);
    expect(await validate(plainToInstance(UpdateProductDto, { code: '123456.78' }))).toHaveLength(0);
    expect(await validate(plainToInstance(UpdateProductDto, { name: 'Descrição atualizada' }))).toHaveLength(0);
  });
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
