// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, OperationalMode, UserSession } from './api';
import { OnlineUsersPage, PcpOnlineNotice } from './OnlinePresence';
import { isPresenceAdmin, OnlineUser } from './online-presence';
import { useOnlinePresence } from './useOnlinePresence';

const user: UserSession = { id: 'self', username: 'PCP 1', sector: 'PCP', roles: ['PCP'], permissions: [] };
const colleague: OnlineUser = { id: 'other', username: 'PCP 2', mode: 'PCP', lastSeenAt: '2026-09-29T12:00:00.000Z' };
let host: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  host?.remove();
  host = undefined;
  root = undefined;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('Presença online', () => {
  it('limita a visão geral aos perfis administrativos reais', () => {
    expect(isPresenceAdmin(user)).toBe(false);
    expect(isPresenceAdmin({ ...user, roles: ['ADMIN'] })).toBe(true);
    expect(isPresenceAdmin({ ...user, roles: ['ADMIN_PRODUCAO_PCP'] })).toBe(true);
    expect(isPresenceAdmin({ ...user, roles: ['ADMIN_REVISAO_EXPEDICAO'] })).toBe(true);
    expect(isPresenceAdmin(null)).toBe(false);
  });

  it('mostra os nomes do PCP no aviso e as áreas na consulta administrativa', () => {
    const notice = renderToStaticMarkup(<PcpOnlineNotice users={[colleague]} error={false} />);
    expect(notice).toContain('Outro usuário do PCP está online');
    expect(notice).toContain('PCP 2');
    expect(renderToStaticMarkup(<PcpOnlineNotice users={[]} error={false} />)).toBe('');
    const admin = renderToStaticMarkup(<OnlineUsersPage users={[colleague]} loading={false} error={false} onRetry={() => undefined} />);
    expect(admin).toContain('PCP 2');
    expect(admin).toContain('Última atividade');
  });

  it('envia heartbeat, consulta outros PCP e atualiza ao voltar para a aba', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const heartbeat = vi.spyOn(api, 'post').mockResolvedValue(undefined);
    const query = vi.spyOn(api, 'get').mockResolvedValue([colleague]);
    const interval = vi.spyOn(window, 'setInterval');
    function Harness({ mode }: { mode: OperationalMode }) {
      const presence = useOnlinePresence(user.id, mode, false);
      return <PcpOnlineNotice users={presence.pcpUsers} error={presence.error} />;
    }
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => { root?.render(<Harness mode="PCP" />); await Promise.resolve(); });
    expect(heartbeat).toHaveBeenCalledWith('/presence/heartbeat', {});
    expect(query).toHaveBeenCalledWith('/presence/pcp');
    expect(interval).toHaveBeenCalledWith(expect.any(Function), 20_000);
    expect(host.textContent).toContain('PCP 2');

    query.mockResolvedValue([{ ...colleague, username: 'PCP 3' }]);
    await act(async () => { window.dispatchEvent(new Event('focus')); await Promise.resolve(); });
    expect(host.textContent).toContain('PCP 3');

    heartbeat.mockRejectedValueOnce(new TypeError('Falha de rede'));
    await act(async () => { window.dispatchEvent(new Event('focus')); await Promise.resolve(); });
    expect(host.textContent).toContain('Não foi possível atualizar');

    await act(async () => { root?.render(<Harness mode="PRODUCAO" />); await Promise.resolve(); });
    expect(host.textContent).not.toContain('PCP 3');
  });

  it('não consulta presença quando o heartbeat falha', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const heartbeat = vi.spyOn(api, 'post').mockRejectedValueOnce(new ApiError('Sessão expirada', undefined, undefined, 401));
    const query = vi.spyOn(api, 'get');
    function Harness() {
      useOnlinePresence(user.id, 'PCP', false);
      return <div>Conectado</div>;
    }
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => { root?.render(<Harness />); await Promise.resolve(); });
    expect(heartbeat).toHaveBeenCalledTimes(1);
    expect(query).not.toHaveBeenCalled();
  });
});
