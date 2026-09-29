import { OperationalMode, UserSession } from './api';

export interface OnlineUser {
  id: string;
  username: string;
  mode: OperationalMode;
  lastSeenAt: string;
}

export function isPresenceAdmin(user: UserSession | null): boolean {
  return user?.roles.some((role) => role === 'ADMIN' || role === 'ADMIN_REVISAO_EXPEDICAO' || role === 'ADMIN_PRODUCAO_PCP') ?? false;
}
