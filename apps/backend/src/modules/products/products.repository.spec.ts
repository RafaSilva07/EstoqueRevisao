import { Repository } from 'typeorm';
import { ProductsRepository } from './products.repository';
import { ProductEntity } from './entities/product.entity';
import { ProductQueryDto } from './dto/product-query.dto';

describe('Consulta exata de código de produto', () => {
  it('compara sem diferenciar caixa, parametriza o código e inclui inativos por padrão', async () => {
    const builder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(), addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(), take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    const repository = new ProductsRepository({ createQueryBuilder: () => builder } as unknown as Repository<ProductEntity>);
    await repository.findAndCount(Object.assign(new ProductQueryDto(), { code: 'Ab_%', limit: 1 }));
    expect(builder.andWhere).toHaveBeenCalledWith('LOWER(product.code) = LOWER(:code)', { code: 'Ab_%' });
    expect(builder.andWhere).toHaveBeenCalledTimes(1);
    expect(builder.take).toHaveBeenCalledWith(1);
  });
});
