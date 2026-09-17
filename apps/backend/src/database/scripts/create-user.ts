import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { AuditLogEntity } from '../../modules/audit/entities/audit-log.entity';
import { PasswordHasherService } from '../../modules/auth/password-hasher.service';
import { UserStatus } from '../../modules/users/domain/user-status.enum';
import { UserEntity } from '../../modules/users/entities/user.entity';
import { RoleEntity } from '../../modules/users/entities/role.entity';
import dataSource from '../data-source';

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} deve ser definida para criar o usuario inicial.`);
  }
  return value;
}

function numberEnvironment(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} possui valor invalido.`);
  }
  return value;
}

async function createUser(): Promise<void> {
  const username = requiredEnvironment('BOOTSTRAP_USERNAME');
  const password = requiredEnvironment('BOOTSTRAP_PASSWORD');
  const roleCode = process.env.BOOTSTRAP_ROLE_CODE?.trim() || 'ADMIN';

  if (username.length > 100) {
    throw new Error('BOOTSTRAP_USERNAME deve ter no maximo 100 caracteres.');
  }
  if (password.length < 8 || password.length > 128) {
    throw new Error('BOOTSTRAP_PASSWORD deve ter entre 8 e 128 caracteres.');
  }

  const passwordHasher = new PasswordHasherService(new ConfigService({
    ARGON2_MEMORY_COST: numberEnvironment('ARGON2_MEMORY_COST', 65536),
    ARGON2_TIME_COST: numberEnvironment('ARGON2_TIME_COST', 3),
    ARGON2_PARALLELISM: numberEnvironment('ARGON2_PARALLELISM', 1),
  }));

  await dataSource.initialize();
  try {
    const existing = await dataSource
      .getRepository(UserEntity)
      .createQueryBuilder('user')
      .where('LOWER(user.username) = LOWER(:username)', { username })
      .getOne();

    if (existing) {
      throw new Error('Ja existe um usuario com esse identificador.');
    }

    const user = new UserEntity();
    user.username = username;
    user.passwordHash = await passwordHasher.hash(password);
    user.status = UserStatus.Active;
    user.sector = ['PRODUCAO', 'EXPEDICAO', 'PCP'].includes(roleCode.toUpperCase()) ? roleCode.toUpperCase() : 'REVISAO';

    await dataSource.transaction(async (manager) => {
      const role = await manager
        .getRepository(RoleEntity)
        .createQueryBuilder('role')
        .where('UPPER(role.code) = UPPER(:roleCode)', { roleCode })
        .getOne();
      if (!role) {
        throw new Error(`O perfil ${roleCode} nao existe. Execute as migrations antes.`);
      }

      await manager.save(user);
      await manager
        .createQueryBuilder()
        .insert()
        .into('user_roles')
        .values({ user_id: user.id, role_id: role.id })
        .execute();

      const audit = new AuditLogEntity();
      audit.userId = null;
      audit.action = 'SYSTEM_USER_BOOTSTRAP';
      audit.entityType = 'USER';
      audit.entityId = user.id;
      audit.result = 'SUCCESS';
      audit.oldValues = null;
      audit.newValues = { username: user.username, status: user.status, role: role.code, sector: user.sector };
      audit.ipAddress = null;
      audit.userAgent = 'database-script';
      audit.requestId = randomUUID();
      await manager.save(audit);
    });

    process.stdout.write(`Usuario criado com id ${user.id} e perfil ${roleCode}.\n`);
  } finally {
    await dataSource.destroy();
  }
}

void createUser().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Falha desconhecida.';
  process.stderr.write(`Nao foi possivel criar o usuario: ${message}\n`);
  process.exitCode = 1;
});
