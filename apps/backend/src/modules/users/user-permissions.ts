import { PermissionEntity } from './entities/permission.entity';
import { UserEntity } from './entities/user.entity';
import { UserPermissionEntity } from './entities/user-permission.entity';

export function presetPermissionCodes(user: Pick<UserEntity, 'roles'>): string[] {
  return [...new Set((user.roles ?? []).flatMap((role) => (role.permissions ?? []).map((permission) => permission.code)))].sort();
}

export function effectivePermissionCodes(user: Pick<UserEntity, 'roles' | 'permissionAssignments'>): string[] {
  // O admin geral mantém acesso completo; suas atribuições não são delegáveis.
  if (user.roles?.some((role) => role.code === 'ADMIN')) return presetPermissionCodes(user);
  return (user.permissionAssignments ?? []).filter((assignment) => assignment.override ?? assignment.presetAllowed)
    .map((assignment) => assignment.permission.code).sort();
}

export function buildPermissionAssignments(
  userId: string, permissions: PermissionEntity[], baseline: string[],
  selected?: string[], previous: UserPermissionEntity[] = [],
): UserPermissionEntity[] {
  const base = new Set(baseline);
  const chosen = selected === undefined ? null : new Set(selected);
  const overrides = new Map(previous.map((assignment) => [assignment.permissionId, assignment.override]));
  return permissions.map((permission) => Object.assign(new UserPermissionEntity(), {
    userId, permissionId: permission.id, permission, presetAllowed: base.has(permission.code),
    override: chosen ? chosen.has(permission.code) === base.has(permission.code) ? null : chosen.has(permission.code)
      : overrides.get(permission.id) ?? null,
  }));
}
