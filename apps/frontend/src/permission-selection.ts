export interface PermissionOption { code: string; label: string; group: string; modes: string[]; dependencies: string[] }
export interface PermissionPreset { code: string; name: string; permissionCodes: string[]; modes: string[]; version: number; userCount: number; editable: boolean }

export function togglePermission(options: PermissionOption[], selected: string[], code: string, checked: boolean): string[] {
  const next = new Set(selected);
  if (checked) {
    const visited = new Set<string>();
    const add = (current: string) => {
      if (visited.has(current)) return;
      visited.add(current);
      next.add(current);
      options.find((option) => option.code === current)?.dependencies.forEach(add);
    };
    add(code);
  } else {
    next.delete(code);
    let removed = true;
    while (removed) {
      removed = false;
      for (const option of options) if (next.has(option.code) && option.dependencies.some((dependency) => !next.has(dependency))) {
        next.delete(option.code); removed = true;
      }
    }
  }
  return [...next].sort();
}
