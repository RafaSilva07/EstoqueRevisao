import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiClient } from './api';

describe('Setor operacional nas requisições', () => {
  afterEach(() => {
    api.setOperationalSector(null);
    vi.unstubAllGlobals();
  });

  it('envia o setor escolhido no cabeçalho autenticado', async () => {
    let capturedHeaders: Headers | undefined;
    const fetchMock = vi.fn((_input: string | URL | Request, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers);
      return Promise.resolve(new Response(JSON.stringify({ items: [] }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      }));
    });
    vi.stubGlobal('fetch', fetchMock);
    api.setOperationalSector('EXPEDICAO');
    await api.get('/shipments');
    expect(capturedHeaders?.get('X-Operational-Sector')).toBe('EXPEDICAO');
  });
});

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json' },
});

describe('renovação da sessão', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('renova uma vez para chamadas simultâneas e repete cada consulta com o novo token', async () => {
    const client = new ApiClient();
    let refreshCount = 0;
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const path = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (path.endsWith('/auth/login')) return Promise.resolve(json({ accessToken: 'old', user: { id: 'user-1' } }));
      if (path.endsWith('/auth/refresh')) {
        refreshCount += 1;
        return Promise.resolve(json({ accessToken: 'new', user: { id: 'user-1' } }));
      }
      const token = new Headers(init?.headers).get('Authorization');
      return Promise.resolve(token === 'Bearer new' ? json({ ok: true }) : json({ error: { code: 'UNAUTHORIZED' } }, 401));
    });
    vi.stubGlobal('fetch', fetchMock);
    await client.login('operador', 'senha');

    const results = await Promise.all([client.get<{ ok: boolean }>('/a'), client.get<{ ok: boolean }>('/b')]);

    expect(results).toEqual([{ ok: true }, { ok: true }]);
    expect(refreshCount).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it('renova também antes de repetir o carregamento de fotos', async () => {
    const client = new ApiClient();
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const path = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (path.endsWith('/auth/login')) return Promise.resolve(json({ accessToken: 'old', user: { id: 'user-1' } }));
      if (path.endsWith('/auth/refresh')) return Promise.resolve(json({ accessToken: 'new', user: { id: 'user-1' } }));
      return Promise.resolve(new Headers(init?.headers).get('Authorization') === 'Bearer new'
        ? new Response('foto', { status: 200 }) : json({ error: {} }, 401));
    }));
    await client.login('operador', 'senha');

    expect(await (await client.getBlob('/photos/1')).text()).toBe('foto');
  });

  it('encerra a sessão local quando o cookie pertence a outra conta', async () => {
    const client = new ApiClient();
    const invalidated = vi.fn();
    client.setSessionInvalidHandler(invalidated);
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request) => {
      const path = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (path.endsWith('/auth/login')) return Promise.resolve(json({ accessToken: 'old', user: { id: 'user-1' } }));
      if (path.endsWith('/auth/refresh')) return Promise.resolve(json({ accessToken: 'other', user: { id: 'user-2' } }));
      return Promise.resolve(json({ error: {} }, 401));
    }));
    await client.login('operador', 'senha');

    await expect(client.get('/protected')).rejects.toMatchObject({ status: 401 });
    expect(invalidated).toHaveBeenCalledTimes(1);
  });

  it('mantém a sessão após falha transitória na renovação e tenta novamente', async () => {
    const client = new ApiClient();
    const invalidated = vi.fn();
    client.setSessionInvalidHandler(invalidated);
    let unavailable = true;
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const path = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (path.endsWith('/auth/login')) return Promise.resolve(json({ accessToken: 'old', user: { id: 'user-1' } }));
      if (path.endsWith('/auth/refresh')) return Promise.resolve(unavailable
        ? json({ error: { code: 'DATABASE_UNAVAILABLE' } }, 503)
        : json({ accessToken: 'new', user: { id: 'user-1' } }));
      return Promise.resolve(new Headers(init?.headers).get('Authorization') === 'Bearer new'
        ? json({ ok: true }) : json({ error: {} }, 401));
    }));
    await client.login('operador', 'senha');

    await expect(client.get('/protected')).rejects.toMatchObject({ status: 401 });
    expect(invalidated).not.toHaveBeenCalled();
    unavailable = false;
    await expect(client.get('/protected')).resolves.toEqual({ ok: true });
  });
});
