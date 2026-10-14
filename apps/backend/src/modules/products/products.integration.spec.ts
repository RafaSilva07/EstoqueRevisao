import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { databaseEntities, databaseMigrations } from '../../database/typeorm.config';
import { ProductQueryDto } from './dto/product-query.dto';
import { ProductEntity } from './entities/product.entity';
import { ProductsRepository } from './products.repository';

const databaseUrl = process.env.TEST_DATABASE_URL;
(databaseUrl ? describe : describe.skip)('Busca livre de produtos (PostgreSQL)', () => {
  let db: DataSource; let repository: ProductsRepository;
  beforeAll(async () => {
    if (!new URL(databaseUrl!).pathname.endsWith('_test')) throw new Error('Banco descartável _test obrigatório.');
    db = new DataSource({ type: 'postgres', url: databaseUrl, entities: databaseEntities, migrations: databaseMigrations, migrationsTableName: 'schema_migrations', dropSchema: true, migrationsRun: true, synchronize: false });
    await db.initialize();
    repository = new ProductsRepository(db.getRepository(ProductEntity));
    const userId = randomUUID();
    await db.query("INSERT INTO users(id,username,password_hash) VALUES ($1,'product-search-test','$argon2id$test-placeholder')", [userId]);
    const products = [
      ['760001', 'MILHO VERDE PANAMÁ', 'UN', true], ['760002', 'MILHO VERDE SEM MARCA', 'UN', true],
      ['760003', 'ERVILHA PANAMÁ', 'UN', true], ['760004', 'MILHO VERDE PANAMÁ', 'FD', true],
      ['760005', 'MILHO %_ PANAMÁ', 'UN', true], ['760006', 'AÇÚCAR CRISTAL PANAMÁ', 'UN', true],
      ['760007', 'MILHO PANAMA INATIVO', 'UN', false],
      ['003375.00', 'SEL LEG PETITOSA 1/170 (UL)', 'UN', true],
      ['003375.10', 'SEL LEG PETITOSA 24/170 (CX)', 'CX', true],
      ['003375.20', 'SEL LEG PETITOSA 24/170 (FD)', 'FD', true],
      ['003375.90', 'SEL LEG PETITOSA 1/170 (UL3)', 'UN', true],
      ['003375.94', 'SEL LEG PETITOSA 24/170 (CX3)', 'CX', true],
    ];
    for (const [code, name, unit, active] of products) {
      await db.query('INSERT INTO products(id,code,name,default_unit,units_per_package,active,created_by,updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$7)', [randomUUID(), code, name, unit, unit === 'FD' || unit === 'CX' ? 24 : null, active, userId]);
    }
    await db.query("INSERT INTO product_unit_options(package_product_id,unit_product_id) SELECT package.id,unit.id FROM products package,products unit WHERE package.code='760004' AND unit.code='760001'");
  });
  afterAll(async () => { if (db?.isInitialized) await db.destroy(); });
  const search = (value: string, extra: Partial<ProductQueryDto> = {}): Promise<[ProductEntity[], number]> => repository.findAndCount(Object.assign(new ProductQueryDto(), { search: value, searchField: 'name', active: true, sort: 'CODE', ...extra }));

  it.each(['panama verde', 'VERDE PANAMÁ', '  verde   panama  ', 'panama verde panama'])('encontra palavras fora da ordem e sem acentos: %s', async (value) => {
    const [items, total] = await search(value);
    expect(items.map((item) => item.code)).toEqual(['760001', '760004']); expect(total).toBe(2);
    expect(items[1].unitProducts.map((item) => item.code)).toEqual(['760001']);
  });
  it('encontra palavra no fim do nome e combina filtros de produto ativo/unidade/paginação', async () => {
    const [items, total] = await search('panama milho', { defaultUnit: 'UN', limit: 1, page: 2 });
    expect(items.map((item) => item.code)).toEqual(['760005']); expect(total).toBe(2);
    expect((await search('panama'))[1]).toBe(5);
    expect((await search('acucar panama'))[0].map((item) => item.code)).toEqual(['760006']);
  });
  it('mantém busca por trecho de código e combina código e nome no campo geral', async () => {
    expect((await search('60001', { searchField: 'code' }))[0].map((item) => item.code)).toEqual(['760001']);
    expect((await search('760001 panama', { searchField: undefined }))[0].map((item) => item.code)).toEqual(['760001']);
    expect((await repository.findAndCount(Object.assign(new ProductQueryDto(), { code: '760007' })))[1]).toBe(1);
  });
  it('exige todas as palavras e trata caracteres especiais como texto literal', async () => {
    expect((await search('panama inexistente'))[1]).toBe(0);
    expect((await search('%_'))[0].map((item) => item.code)).toEqual(['760005']);
    expect((await search("%' OR true --"))[1]).toBe(0);
  });
  it.each(['sel petito', 'petito sel', '  SEL   PETITO  '])('encontra as cinco variantes PETITOSA por trechos separados: %s', async (value) => {
    const [items, total] = await search(value);
    expect(items.map((item) => item.code)).toEqual(['003375.00', '003375.10', '003375.20', '003375.90', '003375.94']);
    expect(total).toBe(5);
  });
});
