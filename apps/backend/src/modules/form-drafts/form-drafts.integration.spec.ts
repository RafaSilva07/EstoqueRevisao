import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { databaseEntities, databaseMigrations } from '../../database/typeorm.config';
import { AccountFormDrafts1791331200000 } from '../../database/migrations/1791331200000-account-form-drafts';
import { AuthenticatedUser } from '../auth/authenticated-user.interface';
import { StorageService, UploadedImage } from '../storage/storage.service';
import { FormDraftsService, SaveFormDraft } from './form-drafts.service';

const url = process.env.TEST_DATABASE_URL;
(url ? describe : describe.skip)('Rascunhos por conta (PostgreSQL)', () => {
  let db: DataSource; let service: FormDraftsService; let user: AuthenticatedUser;
  const saveImage = jest.fn((file: UploadedImage) => Promise.resolve({ key: `shipments/${randomUUID()}.jpg`, size: file.size, mimeType: file.mimetype }));
  const deleteImage = jest.fn(() => Promise.resolve());
  const photo: UploadedImage = { buffer: Buffer.from('photo'), mimetype: 'image/jpeg', size: 5, originalname: 'evidencia.jpg' };
  const dto = (version = 0, value: Record<string, unknown> = { observation: 'Parcial' }): SaveFormDraft => ({ version, title: 'Entrada', value, files: [] });
  beforeAll(async () => {
    if (!new URL(url!).pathname.endsWith('_test')) throw new Error('Banco descartável _test obrigatório.');
    db = new DataSource({ type: 'postgres', url, entities: databaseEntities, migrations: databaseMigrations, migrationsTableName: 'schema_migrations', dropSchema: true, migrationsRun: true, synchronize: false });
    await db.initialize();
    user = { id: randomUUID(), username: 'Operador', sessionId: randomUUID(), sector: 'REVISAO', roles: ['REVISAO'], permissions: ['movements.external-entry', 'movements.external-exit', 'preferences'] };
    await db.query("INSERT INTO users(id,username,password_hash,sector) VALUES ($1,'Operador','$argon2id$test','REVISAO')", [user.id]);
    service = new FormDraftsService(db, { saveImage, deleteImage, validateImage: jest.fn(), readImage: jest.fn(() => Promise.resolve(Buffer.from('photo'))) } as unknown as StorageService);
  });
  beforeEach(async () => { await db.query('TRUNCATE form_drafts'); saveImage.mockClear(); deleteImage.mockClear(); });
  afterAll(async () => { if (db?.isInitialized) await db.destroy(); });
  it('permite reverter e reaplicar a migration sem rascunhos ativos', async () => {
    const runner = db.createQueryRunner();
    await runner.connect(); await runner.startTransaction();
    try {
      const migration = new AccountFormDrafts1791331200000();
      await migration.down(runner); await migration.up(runner);
      const tables = await runner.query("SELECT relrowsecurity FROM pg_class WHERE relname='form_drafts'") as Array<{ relrowsecurity: boolean }>;
      expect(tables[0].relrowsecurity).toBe(true);
    } finally { await runner.rollbackTransaction(); await runner.release(); }
  });
  it('recupera o mesmo preenchimento/foto com outra sessão da mesma conta', async () => {
    await service.save('entry', 'REVISAO', { ...dto(0, { items: [{ file: { __draftFile: 0 } }] }), files: [{ name: 'foto.jpg', lastModified: 10 }] }, [photo], user);
    const otherDevice = { ...user, sessionId: randomUUID() };
    expect(await service.get('entry', 'REVISAO', otherDevice)).toMatchObject({ version: 1, record: { value: { items: [{ file: { __draftFile: 0 } }] }, files: [{ name: 'foto.jpg' }] } });
    expect((await service.photo('entry', 'REVISAO', 0, 1, otherDevice)).data.toString()).toBe('photo');
    expect(await service.get('entry', 'REVISAO', { ...otherDevice, id: randomUUID() })).toEqual({ version: 0, record: null });
  });
  it('reutiliza fotos guardadas sem reupload nem excluir foto ainda referenciada', async () => {
    await service.save('entry', 'REVISAO', { ...dto(), files: [{ name: 'foto.jpg', lastModified: 10 }] }, [photo], user);
    await service.save('entry', 'REVISAO', { ...dto(1), files: [{ name: 'foto.jpg', lastModified: 10, reuseOrdinal: 0 }] }, [], user);
    expect(saveImage).toHaveBeenCalledTimes(1); expect(deleteImage).not.toHaveBeenCalled();
    await service.clear('entry', 'REVISAO', 2, user); expect(deleteImage).toHaveBeenCalledTimes(1);
  });
  it('serializa edições concorrentes e impede sobrescrever a versão atual', async () => {
    const results = await Promise.allSettled([service.save('entry', 'REVISAO', dto(), [], user), service.save('entry', 'REVISAO', dto(), [], user)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect((results.find((result) => result.status === 'rejected') as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
    await expect(service.clear('entry', 'REVISAO', 0, user)).rejects.toBeInstanceOf(ConflictException);
  });
  it('descarta parent/editores, não outro formulário, e evita ressuscitar rascunho antigo', async () => {
    for (const key of ['entry', 'entry:editor', 'exit']) await service.save(key, 'REVISAO', dto(), [], user);
    await service.clear('entry', 'REVISAO', 1, user);
    expect(await service.get('entry', 'REVISAO', user)).toEqual({ version: 2, record: null });
    expect(await service.get('entry:editor', 'REVISAO', user)).toEqual({ version: 2, record: null });
    expect((await service.get('exit', 'REVISAO', user)).record).not.toBeNull();
    await expect(service.save('entry', 'REVISAO', dto(1), [], user)).rejects.toBeInstanceOf(ConflictException);
  });
  it('rejeita modo/permissão incompatíveis, campos sensíveis e payload inválido', async () => {
    await expect(service.get('entry', 'PRODUCAO', user)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.get('entry', 'REVISAO', { ...user, permissions: [] })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.save('entry', 'REVISAO', dto(0, { nested: { password: 'never-store' } }), [], user)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.save('entry', 'REVISAO', { ...dto(), files: [{ name: 'foto', lastModified: 0, reuseOrdinal: 100 }] }, [], user)).rejects.toBeInstanceOf(BadRequestException);
    expect((await service.get('entry', 'REVISAO', user)).record).toBeNull();
    expect((await db.query<Array<{ relrowsecurity: boolean }>>("SELECT relrowsecurity FROM pg_class WHERE relname='form_drafts'"))[0].relrowsecurity).toBe(true);
  });
});
