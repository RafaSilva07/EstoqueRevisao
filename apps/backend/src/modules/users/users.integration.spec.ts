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
import { UsersService } from './users.service';
import { UserStatus } from './domain/user-status.enum';
import { AuditRequestMetadata } from '../audit/audit.types';
import { CreateUserDto } from './dto/user.dto';

const databaseUrl = process.env.TEST_DATABASE_URL;
(databaseUrl ? describe : describe.skip)('Administração de usuários (PostgreSQL)', () => {
  let db: DataSource;
  let service: UsersService;
  let audit: AuditService;
  let actor: string;
  const hasher = new PasswordHasherService(new ConfigService({ ARGON2_MEMORY_COST: 8192, ARGON2_TIME_COST: 1, ARGON2_PARALLELISM: 1 }));
  const metadata = (): AuditRequestMetadata => ({ requestId: randomUUID(), ipAddress: null, userAgent: 'jest-users' });
  const input = (username: string = randomUUID()): CreateUserDto => ({ username, password: 'Senha-teste-123', sector: 'PRODUCAO', roleCodes: ['PRODUCAO'] });
  beforeAll(async () => {
    if (!new URL(databaseUrl!).pathname.endsWith('_test')) throw new Error('Exige banco descartável _test.');
    db = new DataSource({ type: 'postgres', url: databaseUrl, entities: databaseEntities, migrations: databaseMigrations,
      migrationsTableName: 'schema_migrations', dropSchema: true, migrationsRun: true, synchronize: false });
    await db.initialize();
    audit = new AuditService(new AuditRepository(db.getRepository(AuditLogEntity)));
    service = new UsersService(new UsersRepository(db.getRepository(UserEntity)), db, hasher, audit);
  });
  beforeEach(async () => {
    jest.restoreAllMocks();
    await db.query('TRUNCATE users CASCADE');
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

  it('disponibiliza Revisão operacional sem permissões administrativas', async () => {
    const created = await service.create({ ...input('review-operator'), sector: 'REVISAO', roleCodes: ['REVISAO'] }, actor, metadata());
    expect(created.roles.map((role) => role.code)).toEqual(['REVISAO']);
    const permissions = await db.query<{ code: string }[]>("SELECT p.code FROM permissions p JOIN role_permissions rp ON rp.permission_id=p.id JOIN roles r ON r.id=rp.role_id WHERE r.code='REVISAO'");
    expect(permissions.map((p) => p.code).sort()).toEqual(['products.read', 'product-conversions.read', 'batches.read', 'stocks.read', 'stock-positions.read', 'movements.read', 'movements.create', 'shipments.read', 'shipments.create', 'shipments.decide'].sort());
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
});
