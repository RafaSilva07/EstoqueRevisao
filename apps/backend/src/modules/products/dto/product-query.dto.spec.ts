import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ProductQueryDto } from './product-query.dto';

describe('Filtro exato de código', () => {
  it('remove espaços externos e aceita o limite do cadastro', async () => {
    const query = plainToInstance(ProductQueryDto, { code: '  ABC  ' });
    expect(query.code).toBe('ABC');
    expect(await validate(query)).toHaveLength(0);
    expect(await validate(plainToInstance(ProductQueryDto, { code: 'A'.repeat(60) }))).toHaveLength(0);
  });
  it('rejeita código não textual ou maior que o permitido', async () => {
    for (const code of [123, 'A'.repeat(61)]) {
      expect(await validate(plainToInstance(ProductQueryDto, { code }))).not.toHaveLength(0);
    }
  });
});
