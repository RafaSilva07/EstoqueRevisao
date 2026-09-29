import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthSessionEntity } from './entities/auth-session.entity';

export interface OnlineUser {
  id: string;
  username: string;
  mode: string;
  lastSeenAt: string;
}

interface OnlineUserRow extends Omit<OnlineUser, 'lastSeenAt'> {
  lastSeenAt: Date | string;
}

@Injectable()
export class PresenceRepository {
  constructor(
    @InjectRepository(AuthSessionEntity)
    private readonly sessions: Repository<AuthSessionEntity>,
  ) {}

  async heartbeat(sessionId: string, userId: string, mode: string): Promise<boolean> {
    const result = await this.sessions.createQueryBuilder()
      .update(AuthSessionEntity)
      .set({ lastUsedAt: () => 'CURRENT_TIMESTAMP', operationalMode: mode })
      .where('id = :sessionId AND user_id = :userId', { sessionId, userId })
      .andWhere('revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP')
      .execute();
    return (result.affected ?? 0) > 0;
  }

  async listOnlineUsers(pcpOnly = false, excludeUserId?: string): Promise<OnlineUser[]> {
    const filter = pcpOnly ? 'AND s.operational_mode = \'PCP\' AND s.user_id <> $1' : '';
    const rows = await this.sessions.query<OnlineUserRow[]>(`
      SELECT id, username, mode, "lastSeenAt"
      FROM (
        SELECT DISTINCT ON (u.id)
          u.id, u.username, s.operational_mode AS mode, s.last_used_at AS "lastSeenAt"
        FROM auth_sessions s
        JOIN users u ON u.id = s.user_id
        WHERE u.status = 'ACTIVE'
          AND s.revoked_at IS NULL
          AND s.expires_at > CURRENT_TIMESTAMP
          AND s.last_used_at >= CURRENT_TIMESTAMP - INTERVAL '60 seconds'
          AND s.operational_mode IS NOT NULL
          ${filter}
        ORDER BY u.id, s.last_used_at DESC, s.id
      ) active_users
      ORDER BY "lastSeenAt" DESC, username
    `, pcpOnly ? [excludeUserId] : []);
    return rows.map((row) => ({
      id: row.id,
      username: row.username,
      mode: row.mode,
      lastSeenAt: new Date(row.lastSeenAt).toISOString(),
    }));
  }
}
