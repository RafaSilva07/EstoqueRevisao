import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { databaseEntities, databaseMigrations } from '../../database/typeorm.config';
import { AuditService } from '../audit/audit.service';
import { AuditRepository } from '../audit/audit.repository';
import { AuditLogEntity } from '../audit/entities/audit-log.entity';
import { PasswordHasherService } from '../auth/password-hasher.service';
import { AuthSessionEntity } from '../auth/entities/auth-session.entity';
import { UserEntity } from './entities/user.entity';
import { UsersRepository } from './repositories/users.repository';
import { PermissionPreset, UsersService } from './users.service';
import { UserStatus } from './domain/user-status.enum';
import { AuditRequestMetadata } from '../audit/audit.types';
import { CreateUserDto } from './dto/user.dto';
import { UserPreferencesService } from './user-preferences.service';
import { RoleEntity } from './entities/role.entity';

const databaseUrl = process.env.TEST_DATABASE_URL;
(databaseUrl ? describe : describe.skip)('Administração de usuários (PostgreSQL)', () => {
  let db: DataSource;
  let service: UsersService;
  let audit: AuditService;
  let actor: string;
  let originalPresets: RoleEntity[];
  const hasher = new PasswordHasherService(new ConfigService({ ARGON2_MEMORY_COST: 8192, ARGON2_TIME_COST: 1, ARGON2_PARALLELISM: 1 }));
  const metadata = (): AuditRequestMetadata => ({ requestId: randomUUID(), ipAddress: null, userAgent: 'jest-users' });
  const input = (username: string = randomUUID()): CreateUserDto => ({ username, password: 'Senha-teste-123', sector: 'PRODUCAO', roleCodes: ['PRODUCAO'] });
  beforeAll(async () => {
    if (!new URL(databaseUrl!).pathname.endsWith('_test')) throw new Error('Exige banco descartável _test.');
    db = new DataSource({ type: 'postgres', url: databaseUrl, entities: databaseEntities, migrations: databaseMigrations,
      migrationsTableName: 'schema_migrations', dropSchema: true, migrationsRun: true, synchronize: false });
    await db.initialize();
    originalPresets = await db.getRepository(RoleEntity).find({ relations: { permissions: true } });
    audit = new AuditService(new AuditRepository(db.getRepository(AuditLogEntity)));
    service = new UsersService(new UsersRepository(db.getRepository(UserEntity)), db, hasher, audit);
  });
  beforeEach(async () => {
    jest.restoreAllMocks();
    await db.query('TRUNCATE users CASCADE');
    await db.getRepository(RoleEntity).save(originalPresets);
    actor = randomUUID();
    await db.query("INSERT INTO users(id, username, password_hash) VALUES ($1, 'admin-test', '$argon2id$test-only')", [actor]);
    await db.query("INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE code='ADMIN'", [actor]);
  });
  afterAll(async () => { if (db?.isInitialized) await db.destroy(); });

  it('cria com Argon2id, lista, consulta e audita sem credenciais', async () => {
    const created = await service.create(input('Operador'), actor, metadata());
    const secret = await db.getRepository(UserEntity).createQueryBuilder('u').addSelect('u.passwordHash').where('u.id = :id', { id: created.id }).getOneOrFail();
    expect(secret.passwordHash).toMatch(/^\$argon2id\$/);
    expect(await hasher.verify(secret.passwordHash, 'Senha-teste-123')).toBe(true);
    expect(await service.get(created.id)).toEqual(created);
    const page = await service.list({ page: 1, limit: 1, search: 'oper' });
    expect(page.meta.total).toBe(1); expect(page.items[0].id).toBe(created.id);
    const logs = await db.getRepository(AuditLogEntity).find();
    expect(JSON.stringify({ created, page, logs })).not.toMatch(/Senha-teste|\$argon2id|passwordHash/);
  });

  it('guarda tema e fundo por usuário sem alterar a preferência de outra conta', async () => {
    const preferences = new UserPreferencesService(db);
    const otherId = randomUUID();
    await db.query("INSERT INTO users(id, username, password_hash) VALUES ($1, 'operador-test', '$argon2id$test-only')", [otherId]);
    expect(await preferences.get(actor)).toEqual({ theme: 'LIGHT', backgroundColor: null });
    expect(await preferences.update(actor, { theme: 'DARK', backgroundColor: '#f4a8c8' })).toEqual({
      theme: 'DARK', backgroundColor: '#F4A8C8',
    });
    expect(await preferences.get(otherId)).toEqual({ theme: 'LIGHT', backgroundColor: null });
    await expect(preferences.update(actor, { theme: 'LIGHT', backgroundColor: '#xyzxyz' }))
      .rejects.toThrow();
    expect(await preferences.get(actor)).toEqual({ theme: 'DARK', backgroundColor: '#F4A8C8' });
    expect(await preferences.update(actor, { theme: 'LIGHT', backgroundColor: null })).toEqual({
      theme: 'LIGHT', backgroundColor: null,
    });
  });

  it('disponibiliza Revisão operacional sem permissões administrativas', async () => {
    const created = await service.create({ ...input('review-operator'), sector: 'REVISAO', roleCodes: ['REVISAO'] }, actor, metadata());
    expect(created.roles.map((role) => role.code)).toEqual(['REVISAO']);
    const permissions = await db.query<{ code: string }[]>("SELECT p.code FROM permissions p JOIN role_permissions rp ON rp.permission_id=p.id JOIN roles r ON r.id=rp.role_id WHERE r.code='REVISAO'");
    expect(permissions.map((p) => p.code).sort()).toEqual(['products.read', 'products.create', 'products.update', 'products.manage-status', 'product-conversions.read', 'batches.read', 'stocks.read', 'stock-positions.read', 'movements.read', 'movements.create', 'movements.transfer', 'movements.review', 'shipments.read', 'shipments.create', 'shipments.decide'].sort());
    await expect(service.create({ ...input('wrong-sector'), roleCodes: ['REVISAO'] }, actor, metadata())).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create(input('forbidden'), created.id, metadata())).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('bloqueia login duplicado sem diferenciar caixa e perfil inválido', async () => {
    await service.create(input('Operador'), actor, metadata());
    await expect(service.create(input('operador'), actor, metadata())).rejects.toBeInstanceOf(ConflictException);
    await expect(service.create({ ...input(), roleCodes: ['FICTICIO'] }, actor, metadata())).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cria PCP em seu próprio setor e rejeita combinações incompatíveis', async () => {
    const pcp = await service.create({ ...input('pcp-test'), sector: 'PCP', roleCodes: ['PCP'] }, actor, metadata());
    expect(pcp.roles.map((role) => role.code)).toEqual(['PCP']);
    expect(pcp.sector).toBe('PCP');
    await expect(service.create({ ...input('pcp-setor'), sector: 'PRODUCAO', roleCodes: ['PCP'] }, actor, metadata())).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ ...input('pcp-misto'), sector: 'PCP', roleCodes: ['PCP', 'PRODUCAO'] }, actor, metadata())).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ ...input('pcp-sem-perfil'), sector: 'PCP', roleCodes: ['PRODUCAO'] }, actor, metadata())).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cria administradores de área somente no setor permitido e sem gestão de usuários', async () => {
    const review = await service.create({ ...input('admin-review'), sector: 'REVISAO', roleCodes: ['ADMIN_REVISAO_EXPEDICAO'] }, actor, metadata());
    const production = await service.create({ ...input('admin-production'), roleCodes: ['ADMIN_PRODUCAO_PCP'] }, actor, metadata());
    const pcp = await service.create({ ...input('admin-pcp'), sector: 'PCP', roleCodes: ['ADMIN_PRODUCAO_PCP'] }, actor, metadata());
    expect(review.roles.map((role) => role.code)).toEqual(['ADMIN_REVISAO_EXPEDICAO']);
    expect(production.roles.map((role) => role.code)).toEqual(['ADMIN_PRODUCAO_PCP']);
    expect(pcp.sector).toBe('PCP');
    await expect(service.create(input('not-general'), review.id, metadata())).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.create({ ...input('wrong-area'), sector: 'REVISAO', roleCodes: ['ADMIN_PRODUCAO_PCP'] }, actor, metadata())).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ ...input('mixed-area'), roleCodes: ['ADMIN_PRODUCAO_PCP', 'PCP'] }, actor, metadata())).rejects.toBeInstanceOf(BadRequestException);
  });

  it('edita credenciais/perfil, revoga sessões, inativa preservando registro e permite reativar', async () => {
    const created = await service.create(input(), actor, metadata());
    const session = Object.assign(new AuthSessionEntity(), { userId: created.id, refreshTokenHash: 'a'.repeat(64), expiresAt: new Date(Date.now() + 60000) });
    await db.getRepository(AuthSessionEntity).save(session);
    const changed = await service.update(created.id, { username: 'expedidor', password: 'Outra-senha-123', sector: 'EXPEDICAO', roleCodes: ['EXPEDICAO'] }, actor, metadata());
    expect(changed.roles[0].code).toBe('EXPEDICAO');
    expect((await db.getRepository(AuthSessionEntity).findOneByOrFail({ id: session.id })).revokedAt).not.toBeNull();
    await service.remove(created.id, actor, metadata());
    expect((await service.get(created.id)).status).toBe('INACTIVE');
    expect(await new UsersRepository(db.getRepository(UserEntity)).findActiveById(created.id)).toBeNull();
    expect((await service.update(created.id, { status: UserStatus.Active }, actor, metadata())).status).toBe('ACTIVE');
  });

  it('protege a própria conta e impede remover o último administrador', async () => {
    await expect(service.remove(actor, actor, metadata())).rejects.toBeInstanceOf(ConflictException);
    await expect(service.update(actor, { roleCodes: ['PRODUCAO'] }, actor, metadata())).rejects.toBeInstanceOf(ConflictException);
    const other = await service.create(input(), actor, metadata());
    await expect(service.remove(actor, other.id, metadata())).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('cancelamentos concorrentes de acesso não deixam o sistema sem administrador', async () => {
    const other = await service.create({ ...input(), sector: 'REVISAO', roleCodes: ['ADMIN'] }, actor, metadata());
    const outcomes = await Promise.allSettled([service.remove(actor, other.id, metadata()), service.remove(other.id, actor, metadata())]);
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await db.getRepository(UserEntity).countBy({ status: UserStatus.Active })).toBe(1);
  });

  it('rollback restaura usuário e sessões se a auditoria falhar', async () => {
    const created = await service.create(input(), actor, metadata());
    const session = Object.assign(new AuthSessionEntity(), { userId: created.id, refreshTokenHash: 'b'.repeat(64), expiresAt: new Date(Date.now() + 60000) });
    await db.getRepository(AuthSessionEntity).save(session);
    jest.spyOn(audit, 'record').mockRejectedValueOnce(new Error('audit unavailable'));
    await expect(service.remove(created.id, actor, metadata())).rejects.toThrow('audit unavailable');
    expect((await service.get(created.id)).status).toBe('ACTIVE');
    expect((await db.getRepository(AuthSessionEntity).findOneByOrFail({ id: session.id })).revokedAt).toBeNull();
  });

  const reviewInput = (): CreateUserDto => ({ ...input(), sector: 'REVISAO', roleCodes: ['REVISAO'] });
  async function reviewPreset(): Promise<PermissionPreset> {
    const preset = (await service.roles()).find((role) => role.code === 'REVISAO')!;
    const editable = new Set((await service.permissions()).map((permission) => permission.code));
    return { ...preset, permissionCodes: preset.permissionCodes.filter((code) => editable.has(code)) };
  }

  it('concede entrada individual, nega revisão e mantém os demais usuários e o setor', async () => {
    const first = await service.create(reviewInput(), actor, metadata());
    const second = await service.create(reviewInput(), actor, metadata());
    const selected = [...first.permissionCodes.filter((code) => code !== 'movements.review'), 'movements.external-entry'];
    const updated = await service.update(first.id, { permissionCodes: selected }, actor, metadata());
    expect(updated.permissionCodes).toContain('movements.external-entry');
    expect(updated.permissionCodes).not.toContain('movements.review');
    expect(updated.permissionOverrides).toEqual(expect.arrayContaining([
      { code: 'movements.external-entry', allowed: true }, { code: 'movements.review', allowed: false },
    ]));
    expect(updated.sector).toBe('REVISAO');
    expect((await service.get(second.id)).permissionCodes).toEqual(second.permissionCodes);
    const repo = new UsersRepository(db.getRepository(UserEntity));
    expect((await repo.findForLogin(updated.username))?.permissionAssignments).toHaveLength(28);
    await expect(service.update(first.id, { permissionCodes: ['pcp.movements.execute'] }, actor, metadata())).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.update(first.id, { permissionCodes: ['inventada'] }, actor, metadata())).rejects.toBeInstanceOf(BadRequestException);
  });

  it('salvar só o preset preserva acessos atuais e aplica a base nova em novas atribuições', async () => {
    const first = await service.create(reviewInput(), actor, metadata());
    const preset = await reviewPreset();
    const next = [...preset.permissionCodes, 'movements.external-entry'];
    expect(await service.updatePreset('REVISAO', { permissionCodes: next, version: preset.version, applyToUsers: false }, actor, metadata())).toEqual({ updatedUsers: 0 });
    expect((await service.get(first.id)).permissionCodes).toEqual(first.permissionCodes);
    const second = await service.create(reviewInput(), actor, metadata());
    expect(second.permissionCodes).toContain('movements.external-entry');
    expect((await service.update(first.id, { username: 'mesmo-acesso' }, actor, metadata())).permissionCodes).toEqual(first.permissionCodes);
    expect((await service.update(first.id, { applyPreset: true }, actor, metadata())).permissionCodes).toContain('movements.external-entry');
  });

  it('aplica preset preservando concessões/negações individuais, revoga sessões e audita', async () => {
    const first = await service.create(reviewInput(), actor, metadata());
    const second = await service.create(reviewInput(), actor, metadata());
    await service.update(first.id, { permissionCodes: [...first.permissionCodes.filter((code) => code !== 'movements.review'), 'movements.external-entry'] }, actor, metadata());
    const session = await db.getRepository(AuthSessionEntity).save(Object.assign(new AuthSessionEntity(), {
      userId: first.id, refreshTokenHash: 'c'.repeat(64), expiresAt: new Date(Date.now() + 60000),
    }));
    const preset = await reviewPreset();
    const next = preset.permissionCodes.filter((code) => code !== 'products.create');
    expect(await service.updatePreset('REVISAO', { permissionCodes: next, version: preset.version, applyToUsers: true }, actor, metadata())).toEqual({ updatedUsers: 2 });
    const firstAfter = await service.get(first.id);
    expect(firstAfter.permissionCodes).toContain('movements.external-entry');
    expect(firstAfter.permissionCodes).not.toContain('movements.review');
    expect(firstAfter.permissionCodes).not.toContain('products.create');
    expect((await service.get(second.id)).permissionCodes).not.toContain('products.create');
    expect((await db.getRepository(AuthSessionEntity).findOneByOrFail({ id: session.id })).revokedAt).not.toBeNull();
    const events = await db.getRepository(AuditLogEntity).find();
    expect(events.filter((event) => event.action === 'USER_PERMISSIONS_PRESET_APPLY')).toHaveLength(2);
    expect(events.filter((event) => event.action === 'PERMISSION_PRESET_UPDATE')).toHaveLength(1);
  });

  it('protege admin geral, valida escopo e impede alterações concorrentes obsoletas do preset', async () => {
    const first = await service.create(reviewInput(), actor, metadata());
    const preset = await reviewPreset();
    const dto = { permissionCodes: preset.permissionCodes, version: preset.version, applyToUsers: false };
    await expect(service.updatePreset('REVISAO', dto, first.id, metadata())).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.updatePreset('ADMIN', dto, actor, metadata())).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.update(actor, { permissionCodes: [] }, actor, metadata())).rejects.toBeInstanceOf(ConflictException);
    await expect(service.updatePreset('REVISAO', { ...dto, permissionCodes: ['pcp.movements.execute'] }, actor, metadata())).rejects.toBeInstanceOf(BadRequestException);
    const outcomes = await Promise.allSettled([service.updatePreset('REVISAO', dto, actor, metadata()), service.updatePreset('REVISAO', dto, actor, metadata())]);
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.find((result) => result.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(ConflictException);
  });

  it('rollback do preset restaura permissões, usuários e sessões quando a auditoria falha', async () => {
    const first = await service.create(reviewInput(), actor, metadata());
    const preset = await reviewPreset();
    const session = await db.getRepository(AuthSessionEntity).save(Object.assign(new AuthSessionEntity(), {
      userId: first.id, refreshTokenHash: 'd'.repeat(64), expiresAt: new Date(Date.now() + 60000),
    }));
    jest.spyOn(audit, 'record').mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('audit unavailable'));
    await expect(service.updatePreset('REVISAO', { permissionCodes: [], version: preset.version, applyToUsers: true }, actor, metadata())).rejects.toThrow('audit unavailable');
    expect(await reviewPreset()).toEqual(preset);
    expect((await service.get(first.id)).permissionCodes).toEqual(first.permissionCodes);
    expect((await db.getRepository(AuthSessionEntity).findOneByOrFail({ id: session.id })).revokedAt).toBeNull();
  });
});
