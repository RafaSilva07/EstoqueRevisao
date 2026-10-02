import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, In, IsNull } from 'typeorm';
import { paginate, PaginatedResult } from '../../shared/pagination/paginated-result.interface';
import { getPostgresError } from '../../shared/database/postgres-error';
import { AuditService } from '../audit/audit.service';
import { AuditRequestMetadata } from '../audit/audit.types';
import { PasswordHasherService } from '../auth/password-hasher.service';
import { AuthSessionEntity } from '../auth/entities/auth-session.entity';
import { UserEntity } from './entities/user.entity';
import { RoleEntity } from './entities/role.entity';
import { UserStatus } from './domain/user-status.enum';
import { areaAdministratorModes } from '../auth/operational-modes';
import { CreateUserDto, UpdateUserDto, UserQueryDto } from './dto/user.dto';
import { UsersRepository } from './repositories/users.repository';
import { PermissionEntity } from './entities/permission.entity';
import { UserPermissionEntity } from './entities/user-permission.entity';
import { buildPermissionAssignments, effectivePermissionCodes, presetPermissionCodes } from './user-permissions';
import { permissionAllowedInMode } from '../auth/permission-scopes';
import { permissionCatalog, PermissionOption } from './permission-catalog';
import { UpdatePermissionPresetDto } from './dto/permission-preset.dto';

export interface PermissionPreset {
  code: string; name: string; permissionCodes: string[]; modes: string[]; version: number; userCount: number; editable: boolean;
}

export function presetModes(code: string): readonly string[] {
  if (code === 'ADMIN') return ['ADMIN'];
  if (code in areaAdministratorModes) return areaAdministratorModes[code as keyof typeof areaAdministratorModes];
  return ['PRODUCAO', 'EXPEDICAO', 'PCP'].includes(code) ? [code] : ['REVISAO'];
}

export interface PublicUser {
  id: string; username: string; sector: string; status: UserStatus;
  roles: { code: string; name: string }[]; createdAt: Date; updatedAt: Date;
  permissionCodes: string[]; presetPermissionCodes: string[]; permissionOverrides: { code: string; allowed: boolean }[];
}

export function publicUser(user: UserEntity): PublicUser {
  return { id: user.id, username: user.username, sector: user.sector, status: user.status,
    roles: user.roles.map(({ code, name }) => ({ code, name })), createdAt: user.createdAt, updatedAt: user.updatedAt,
    permissionCodes: effectivePermissionCodes(user),
    presetPermissionCodes: user.roles.some((role) => role.code === 'ADMIN') ? presetPermissionCodes(user)
      : (user.permissionAssignments ?? []).filter((assignment) => assignment.presetAllowed).map((assignment) => assignment.permission.code).sort(),
    permissionOverrides: (user.permissionAssignments ?? []).filter((assignment) => assignment.override != null)
      .map((assignment) => ({ code: assignment.permission.code, allowed: assignment.override! })).sort((a, b) => a.code.localeCompare(b.code)),
  };
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

  async roles(): Promise<PermissionPreset[]> {
    const [roles, counts] = await Promise.all([
      this.db.getRepository(RoleEntity).find({ relations: { permissions: true }, order: { name: 'ASC' } }),
      this.db.query<{ role_id: string; count: string }[]>('SELECT role_id, COUNT(*)::text AS count FROM user_roles GROUP BY role_id'),
    ]);
    return roles.map((role) => ({ code: role.code, name: role.name, permissionCodes: presetPermissionCodes({ roles: [role] }),
      modes: [...presetModes(role.code)], version: role.permissionVersion, editable: role.code !== 'ADMIN',
      userCount: Number(counts.find((count) => count.role_id === role.id)?.count ?? 0) }));
  }

  async permissions(): Promise<PermissionOption[]> {
    return permissionCatalog(await this.db.getRepository(PermissionEntity).find());
  }

  async updatePreset(code: string, dto: UpdatePermissionPresetDto, actor: string, metadata: AuditRequestMetadata): Promise<{ updatedUsers: number }> {
    return this.db.transaction(async (manager) => {
      await manager.query("SELECT pg_advisory_xact_lock(hashtext('users-administration'))");
      await this.assertAdministrator(actor, manager);
      const role = await manager.getRepository(RoleEntity).findOne({ where: { code }, relations: { permissions: true } });
      if (!role) throw new NotFoundException('Preset não encontrado.');
      if (role.code === 'ADMIN') throw new ForbiddenException('O admin geral mantém acesso completo e não pode ter seu preset reduzido.');
      if (role.permissionVersion !== dto.version) throw new ConflictException('O preset foi alterado por outro administrador. Reabra e confira as permissões.');
      const permissions = await manager.getRepository(PermissionEntity).find();
      const managed = new Set(permissionCatalog(permissions).map((permission) => permission.code));
      if (dto.permissionCodes.some((permission) => !managed.has(permission))) throw new BadRequestException('Permissão inválida para edição do preset.');
      this.validatePermissionSelection(dto.permissionCodes, permissions, presetModes(role.code));
      const before = presetPermissionCodes({ roles: [role] });
      const selected = new Set(dto.permissionCodes);
      role.permissions = permissions.filter((permission) => selected.has(permission.code) || (!managed.has(permission.code) && before.includes(permission.code)));
      role.permissionVersion += 1;
      await manager.getRepository(RoleEntity).save(role);
      let updatedUsers = 0;
      const updatedIds: string[] = [];
      if (dto.applyToUsers) {
        const ids = await manager.query<{ user_id: string }[]>('SELECT user_id FROM user_roles WHERE role_id = $1', [role.id]);
        const users = ids.length ? await manager.getRepository(UserEntity).find({ where: { id: In(ids.map((item) => item.user_id)) },
          relations: { roles: { permissions: true }, permissionAssignments: { permission: true } } }) : [];
        for (const user of users) {
          // ADMIN misto não perde acesso completo por alterações em presets operacionais.
          if (user.roles.some((assigned) => assigned.code === 'ADMIN')) continue;
          const oldValues = publicUser(user);
          user.permissionAssignments = buildPermissionAssignments(user.id, permissions, presetPermissionCodes(user), undefined, user.permissionAssignments);
          await manager.getRepository(UserPermissionEntity).save(user.permissionAssignments);
          user.updatedAt = new Date();
          await manager.getRepository(UserEntity).update(user.id, { updatedAt: user.updatedAt });
          await this.audit.record({ ...metadata, manager, userId: actor, entityType: 'USER', entityId: user.id,
            action: 'USER_PERMISSIONS_PRESET_APPLY', result: 'SUCCESS', oldValues: { ...oldValues }, newValues: { ...publicUser(user), preset: code } });
          updatedUsers += 1;
          updatedIds.push(user.id);
        }
        if (updatedIds.length) await manager.getRepository(AuthSessionEntity).update({ userId: In(updatedIds), revokedAt: IsNull() }, { revokedAt: new Date() });
      }
      await this.audit.record({ ...metadata, manager, userId: actor, entityType: 'ROLE', entityId: role.id,
        action: 'PERMISSION_PRESET_UPDATE', result: 'SUCCESS', oldValues: { permissionCodes: before, version: dto.version },
        newValues: { code, permissionCodes: presetPermissionCodes({ roles: [role] }), version: role.permissionVersion, applyToUsers: dto.applyToUsers, updatedUsers } });
      return { updatedUsers };
    });
  }

  private async assertAdministrator(actor: string, manager: EntityManager): Promise<void> {
    const administrator = await this.repository.findById(actor, manager);
    if (administrator?.status !== UserStatus.Active || !administrator.roles.some((role) => role.code === 'ADMIN')) throw new ForbiddenException('Acesso administrativo revogado.');
  }

  private validatePermissionSelection(codes: string[], permissions: PermissionEntity[], modes: readonly string[]): void {
    const known = new Set(permissions.map((permission) => permission.code));
    const managed = new Set(permissionCatalog(permissions).map((permission) => permission.code));
    if (codes.some((code) => !known.has(code))) throw new BadRequestException('Permissão inválida.');
    if (codes.some((code) => managed.has(code) && !modes.some((mode) => permissionAllowedInMode(code, mode)))) {
      throw new BadRequestException('A permissão não é compatível com os setores/modos deste usuário ou preset.');
    }
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
        await this.assertAdministrator(actor, manager);
        const user = id ? await this.repository.findById(id, manager) : new UserEntity();
        if (!user) throw new NotFoundException('Usuário não encontrado.');
        const before = id ? publicUser(user) : null;
        const roleCodes = dto.roleCodes ?? user.roles?.map((role) => role.code) ?? [];
        const roles = await manager.getRepository(RoleEntity).find({ where: { code: In(roleCodes) }, relations: { permissions: true } });
        if (!roles.length || roles.length !== roleCodes.length) throw new BadRequestException('Perfil inválido.');
        const areaRole = roleCodes.find((code) => code in areaAdministratorModes) as keyof typeof areaAdministratorModes | undefined;
        if (areaRole && roleCodes.length !== 1) throw new BadRequestException('O administrador de área deve utilizar apenas seu perfil administrativo.');
        if (roleCodes.includes('PCP') && roleCodes.length !== 1) throw new BadRequestException('O perfil PCP é exclusivo e não pode ser combinado com perfis operacionais.');
        const status = dto.status ?? user.status;
        const sector = dto.sector ?? user.sector;
        if (areaRole && !(areaAdministratorModes[areaRole] as readonly string[]).includes(sector)) throw new BadRequestException('Setor inicial incompatível com o administrador de área.');
        if (roleCodes.includes('ADMIN') && sector !== 'REVISAO') throw new BadRequestException('Administrador deve pertencer à Revisão.');
        if (roleCodes.includes('REVISAO') && sector !== 'REVISAO') throw new BadRequestException('O perfil Revisão operacional deve pertencer ao setor Revisão.');
        if ((roleCodes.includes('PCP') && sector !== 'PCP') || (sector === 'PCP' && !roleCodes.includes('PCP') && areaRole !== 'ADMIN_PRODUCAO_PCP')) {
          throw new BadRequestException('O setor PCP exige o perfil PCP ou Admin Produção e PCP.');
        }
        if (id === actor && (status !== UserStatus.Active || !roleCodes.includes('ADMIN'))) {
          throw new ConflictException('Você não pode desativar sua própria conta nem remover seu acesso administrativo.');
        }
        if (before?.status === UserStatus.Active && before.roles.some((role) => role.code === 'ADMIN') &&
          (status !== UserStatus.Active || !roleCodes.includes('ADMIN'))) {
          const count = await manager.getRepository(UserEntity).createQueryBuilder('user')
            .innerJoin('user.roles', 'role').where('user.status = :status AND role.code = :code', { status: UserStatus.Active, code: 'ADMIN' }).getCount();
          if (count <= 1) throw new ConflictException('O último administrador ativo deve ser preservado.');
        }
        const previousRoleCodes = user.roles?.map((role) => role.code).sort().join(',') ?? '';
        const permissions = await manager.getRepository(PermissionEntity).find();
        const resetBaseline = !id || dto.applyPreset || roleCodes.slice().sort().join(',') !== previousRoleCodes;
        const baseline = resetBaseline ? presetPermissionCodes({ roles })
          : (user.permissionAssignments ?? []).filter((assignment) => assignment.presetAllowed).map((assignment) => assignment.permission.code);
        const modes = roleCodes.includes('ADMIN') ? ['ADMIN'] : areaRole ? areaAdministratorModes[areaRole] : [sector];
        if (dto.permissionCodes !== undefined) {
          this.validatePermissionSelection(dto.permissionCodes, permissions, modes);
          if (roleCodes.includes('ADMIN') && permissions.some((permission) => !dto.permissionCodes!.includes(permission.code))) {
            throw new ConflictException('O admin geral deve manter acesso completo.');
          }
        }
        user.permissionAssignments = buildPermissionAssignments(user.id, permissions, baseline, dto.permissionCodes,
          resetBaseline ? [] : user.permissionAssignments);
        user.username = dto.username ?? user.username;
        user.sector = sector; user.status = status; user.roles = roles;
        if (hash !== undefined) user.passwordHash = hash;
        await this.repository.save(user, manager);
        await manager.getRepository(UserPermissionEntity).save(user.permissionAssignments);
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
