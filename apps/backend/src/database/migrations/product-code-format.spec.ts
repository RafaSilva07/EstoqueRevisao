import { QueryRunner } from 'typeorm';
import { ProductCodeFormat1790640000000 } from './1790640000000-product-code-format';

describe('ProductCodeFormat1790640000000', () => {
  const migration = new ProductCodeFormat1790640000000();
  const query = jest.fn();
  const runner = { query } as unknown as QueryRunner;

  beforeEach(() => query.mockReset());

  it('recusa dados antigos inválidos sem alterar códigos automaticamente', async () => {
    query.mockResolvedValueOnce([{ total: 2 }]);
    await expect(migration.up(runner)).rejects.toThrow('2 produto(s)');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('protege a tabela quando todos os códigos existentes estão válidos', async () => {
    query.mockResolvedValueOnce([{ total: 0 }]);
    await migration.up(runner);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining('CHK_products_code_format'));
    expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining('^[0-9]{6}([.][0-9]{2})?$'));
  });
});
