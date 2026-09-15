import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, In, IsNull } from 'typeorm';
import { paginate, PaginatedResult } from '../../shared/pagination/paginated-result.interface';
import { getPostgresError } from '../../shared/database/postgres-error';
import { AuditService } from '../audit/audit.service';
import { AuditRequestMetadata } from '../audit/audit.types';
import { PasswordHasherService } from '../auth/password-hasher.service';
import { AuthSessionEntity } from '../auth/entities/auth-session.entity';
import { UserEntity } from './entities/user.entity';
import { RoleEntity } from './entities/role.entity';
import { UserStatus } from './domain/user-status.enum';
import { CreateUserDto, UpdateUserDto, UserQueryDto } from './dto/user.dto';
import { UsersRepository } from './repositories/users.repository';

export interface PublicUser {
  id: string; username: string; sector: string; status: UserStatus;
  roles: { code: string; name: string }[]; createdAt: Date; updatedAt: Date;
}

export function publicUser(user: UserEntity): PublicUser {
  return { id: user.id, username: user.username, sector: user.sector, status: user.status,
    roles: user.roles.map(({ code, name }) => ({ code, name })), createdAt: user.createdAt, updatedAt: user.updatedAt };
}

@Injectable()
export class UsersService {
  constructor(private readonly repository: UsersRepository, private readonly db: DataSource,
    private readonly hasher: PasswordHasherService, private readonly audit: AuditService) {}

  async list(query: UserQueryDto): Promise<PaginatedResult<PublicUser>> {
    const [users, total] = await this.repository.findAndCount(query);
    return paginate(users.map(publicUser), total, query.page, query.limit);
  }

  async get(id: string): Promise<PublicUser> {
    const user = await this.repository.findById(id);
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    return publicUser(user);
  }

  async roles(): Promise<PublicUser['roles']> {
    return (await this.db.getRepository(RoleEntity).find({ order: { name: 'ASC' } }))
      .map(({ code, name }) => ({ code, name }));
  }

  create(dto: CreateUserDto, actor: string, metadata: AuditRequestMetadata): Promise<PublicUser> {
    return this.write(null, dto, actor, metadata);
  }

  update(id: string, dto: UpdateUserDto, actor: string, metadata: AuditRequestMetadata): Promise<PublicUser> {
    if (!Object.keys(dto).length) throw new BadRequestException('Informe ao menos um campo.');
    return this.write(id, dto, actor, metadata);
  }

  remove(id: string, actor: string, metadata: AuditRequestMetadata): Promise<PublicUser> {
    return this.write(id, { status: UserStatus.Inactive }, actor, metadata, true);
  }

  private async write(id: string | null, dto: UpdateUserDto, actor: string, metadata: AuditRequestMetadata, removing = false): Promise<PublicUser> {
    const hash = dto.password === undefined ? undefined : await this.hasher.hash(dto.password);
    try {
      return await this.db.transaction(async (manager) => {
        // Serializa alterações administrativas, inclusive a proteção do último ADMIN.
        await manager.query("SELECT pg_advisory_xact_lock(hashtext('users-administration'))");
        const administrator = await this.repository.findById(actor, manager);
        if (administrator?.status !== UserStatus.Active || !administrator.roles.some((role) => role.code === 'ADMIN')) {
          throw new ForbiddenException('Acesso administrativo revogado.');
        }
        const user = id ? await this.repository.findById(id, manager) : new UserEntity();
        if (!user) throw new NotFoundException('Usuário não encontrado.');
        const before = id ? publicUser(user) : null;
        const roleCodes = dto.roleCodes ?? user.roles?.map((role) => role.code) ?? [];
        const roles = await manager.getRepository(RoleEntity).findBy({ code: In(roleCodes) });
        if (!roles.length || roles.length !== roleCodes.length) throw new BadRequestException('Perfil inválido.');
        const status = dto.status ?? user.status;
        const sector = dto.sector ?? user.sector;
        if (roleCodes.includes('ADMIN') && sector !== 'REVISAO') throw new BadRequestException('Administrador deve pertencer à Revisão; use o modo operacional para alternar setores.');
        if (id === actor && (status !== UserStatus.Active || !roleCodes.includes('ADMIN'))) {
          throw new ConflictException('Você não pode desativar sua própria conta nem remover seu acesso administrativo.');
        }
        if (before?.status === UserStatus.Active && before.roles.some((role) => role.code === 'ADMIN') &&
          (status !== UserStatus.Active || !roleCodes.includes('ADMIN'))) {
          const count = await manager.getRepository(UserEntity).createQueryBuilder('user')
            .innerJoin('user.roles', 'role').where('user.status = :status AND role.code = :code', { status: UserStatus.Active, code: 'ADMIN' }).getCount();
          if (count <= 1) throw new ConflictException('O último administrador ativo deve ser preservado.');
        }
        user.username = dto.username ?? user.username;
        user.sector = sector; user.status = status; user.roles = roles;
        if (hash !== undefined) user.passwordHash = hash;
        await this.repository.save(user, manager);
        if (id) await manager.getRepository(AuthSessionEntity).update({ userId: id, revokedAt: IsNull() }, { revokedAt: new Date() });
        const after = publicUser(user);
        await this.audit.record({ ...metadata, manager, userId: actor, entityType: 'USER', entityId: user.id,
          action: removing ? 'USER_DEACTIVATE' : id ? 'USER_UPDATE' : 'USER_CREATE', result: 'SUCCESS',
          oldValues: before ? { ...before } : null, newValues: { ...after, credentialsChanged: hash !== undefined } });
        return after;
      });
    } catch (error) {
      if (getPostgresError(error)?.code === '23505') throw new ConflictException('Já existe um usuário com esse login.');
      throw error;
    }
  }
}
