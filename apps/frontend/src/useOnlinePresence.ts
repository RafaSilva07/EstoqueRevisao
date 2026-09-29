import { useEffect, useState } from 'react';
import { api, OperationalMode } from './api';
import { OnlineUser } from './online-presence';

type Snapshot = { key: string; pcpUsers: OnlineUser[]; onlineUsers: OnlineUser[]; error: boolean };
const emptySnapshot: Snapshot = { key: '', pcpUsers: [], onlineUsers: [], error: false };

export function useOnlinePresence(userId: string | undefined, mode: OperationalMode, showAll: boolean) {
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [revision, setRevision] = useState(0);
  const key = `${userId ?? ''}:${mode}:${showAll}`;

  useEffect(() => {
    if (!userId) return;
    let active = true;
    let running = false;

    const query = async () => {
      await api.post<void>('/presence/heartbeat', {});
      const [pcpUsers, onlineUsers] = await Promise.all([
        mode === 'PCP' ? api.get<OnlineUser[]>('/presence/pcp') : Promise.resolve([]),
        showAll ? api.get<OnlineUser[]>('/presence') : Promise.resolve([]),
      ]);
      return { pcpUsers, onlineUsers };
    };
    const refresh = async () => {
      if (document.hidden || running) return;
      running = true;
      try {
        const result = await query();
        if (active) setSnapshot({ key, ...result, error: false });
      } catch {
        if (active) setSnapshot({ key, pcpUsers: [], onlineUsers: [], error: true });
      } finally {
        running = false;
      }
    };

    void refresh();
    const timer = window.setInterval(() => void refresh(), 20_000);
    const whenVisible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener('visibilitychange', whenVisible);
    window.addEventListener('focus', whenVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', whenVisible);
      window.removeEventListener('focus', whenVisible);
    };
  }, [userId, mode, showAll, revision, key]);

  const current = snapshot.key === key ? snapshot : emptySnapshot;
  return {
    pcpUsers: current.pcpUsers,
    onlineUsers: current.onlineUsers,
    loading: showAll && snapshot.key !== key,
    error: current.error,
    refresh: () => setRevision((value) => value + 1),
  };
}
