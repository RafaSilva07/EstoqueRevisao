import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';

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
