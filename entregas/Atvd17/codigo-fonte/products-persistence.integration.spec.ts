import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';
import { databaseEntities, databaseMigrations } from '../../database/typeorm.config';
import { UserEntity } from '../users/entities/user.entity';
import { ProductQueryDto } from './dto/product-query.dto';
import { ProductEntity } from './entities/product.entity';
import { ProductsRepository } from './products.repository';

// Opcao B: equivalente ao @DataJpaTest em NestJS + TypeORM + Jest.
// Apenas a persistencia real e carregada; cada caso termina com rollback.
const databaseUrl = process.env.TEST_DATABASE_URL;

(databaseUrl ? describe : describe.skip)('Atividade - Opcao B: persistencia de produtos (PostgreSQL)', () => {
  let database: DataSource;
  let transaction: QueryRunner;
  let module: TestingModule | undefined;
  let repository: ProductsRepository;
  let author: UserEntity;

  beforeAll(async () => {
    if (!new URL(databaseUrl!).pathname.endsWith('_test')) {
      throw new Error('Use somente um banco descartavel com sufixo _test.');
    }
    database = new DataSource({
      type: 'postgres',
      url: databaseUrl,
      entities: databaseEntities,
      migrations: databaseMigrations,
      migrationsTableName: 'schema_migrations',
      migrationsRun: true,
      synchronize: false,
    });
    await database.initialize();
  }, 60_000);

  beforeEach(async () => {
    transaction = database.createQueryRunner();
    await transaction.connect();
    await transaction.startTransaction();

    // Injecao do repositorio real, sem mocks de SQL ou de banco de dados.
    module = await Test.createTestingModule({
      providers: [
        ProductsRepository,
        { provide: getRepositoryToken(ProductEntity), useValue: transaction.manager.getRepository(ProductEntity) },
      ],
    }).compile();
    repository = module.get(ProductsRepository);
    author = await transaction.manager.save(UserEntity, Object.assign(new UserEntity(), {
      username: 'atividade-persistencia',
      passwordHash: '$argon2id$fixture-sem-autenticacao',
    }));
  });

  afterEach(async () => {
    try {
      if (transaction?.isTransactionActive) await transaction.rollbackTransaction();
    } finally {
      if (transaction && !transaction.isReleased) await transaction.release();
      await module?.close();
      module = undefined;
    }
  });

  afterAll(async () => {
    if (database?.isInitialized) await database.destroy();
  });

  function saveProduct(code: string, name: string, active = true): Promise<ProductEntity> {
    return repository.save(Object.assign(new ProductEntity(), {
      code, name, active,
      defaultUnit: 'UN',
      shelfLifeYears: 2,
      unitWeightGrams: 200,
      createdById: author.id,
      updatedById: author.id,
    }));
  }

  it('salva uma entidade e recupera os dados efetivamente persistidos no PostgreSQL', async () => {
    // Arrange / Act: gravacao pelo repositorio utilizado pela aplicacao.
    const saved = await saveProduct('910001', 'MILHO VERDE PANAMA');
    const found = await repository.findById(saved.id);

    // Assert: uma nova leitura SQL recupera o registro e seus campos.
    expect(found).not.toBe(saved);
    expect(found).toMatchObject({
      id: saved.id,
      code: '910001',
      name: 'MILHO VERDE PANAMA',
      defaultUnit: 'UN',
      active: true,
      shelfLifeYears: 2,
      unitWeightGrams: 200,
      createdById: author.id,
      updatedById: author.id,
    });
    expect(found?.createdAt).toBeInstanceOf(Date);
    expect(await transaction.manager.countBy(ProductEntity, { id: saved.id })).toBe(1);
  });

  it('valida a consulta personalizada por nome sem acentos, fora de ordem e somente ativos', async () => {
    const expected = await saveProduct('910001', 'MILHO VERDE PANAMÁ');
    await saveProduct('910002', 'MILHO VERDE PANAMÁ INATIVO', false);
    await saveProduct('910003', 'ERVILHA PANAMÁ');
    await saveProduct('910004', 'MILHO VERDE OUTRA MARCA');

    const query = Object.assign(new ProductQueryDto(), {
      search: 'panama milho', searchField: 'name', active: true, defaultUnit: 'UN',
    });
    const [products, total] = await repository.findAndCount(query);

    expect(total).toBe(1);
    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({ id: expected.id, code: '910001', name: 'MILHO VERDE PANAMÁ', active: true });
  });

  it('retorna lista vazia e total zero quando nenhum registro corresponde a busca', async () => {
    await saveProduct('910001', 'MILHO VERDE PANAMÁ');

    const [products, total] = await repository.findAndCount(Object.assign(new ProductQueryDto(), {
      search: 'produto inexistente', searchField: 'name', active: true,
    }));

    expect(products).toEqual([]);
    expect(total).toBe(0);
  });
});
