import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { UserPreferencesService } from '../users/user-preferences.service';
import { REFRESH_TOKEN_COOKIE } from './auth.constants';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthOriginGuard } from './guards/auth-origin.guard';

describe('autenticacao HTTP: cookies e origem', () => {
  let app: INestApplication;
  let baseUrl: string;
  const origin = 'https://frontend.pages.dev';
  const config = new ConfigService({
    FRONTEND_URL: `${origin}/`, AUTH_COOKIE_SECURE: true, AUTH_COOKIE_SAME_SITE: 'none',
  });
  const result = {
    accessToken: 'access-token', tokenType: 'Bearer', expiresIn: '15m',
    refreshToken: 'private-refresh-token', sessionExpiresAt: new Date(Date.now() + 13 * 60 * 60 * 1000),
    user: { id: 'user-1', username: 'operador', roles: [], permissions: [], sector: 'REVISAO' },
  };
  const auth = {
    login: jest.fn().mockResolvedValue(result), refresh: jest.fn().mockResolvedValue(result),
    logout: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthOriginGuard,
        { provide: ConfigService, useValue: config },
        { provide: AuthService, useValue: auth },
        { provide: UserPreferencesService, useValue: {} },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    await app.listen(0, '127.0.0.1');
    baseUrl = `${await app.getUrl()}/api/v1/auth`;
  });
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => {
    config.set('AUTH_COOKIE_SECURE', true);
    config.set('AUTH_COOKIE_SAME_SITE', 'none');
  });
  afterAll(async () => { await app?.close(); });

  it('login entrega cookie privado cross-site e somente o tempo restante da sessao', async () => {
    const response = await fetch(`${baseUrl}/login`, {
      method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'operador', password: 'password-example' }),
    });
    expect(response.status).toBe(200);
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=None');
    expect(cookie).toContain('Partitioned');
    expect(cookie).toContain('Path=/api/v1/auth');
    const maxAge = Number(/Max-Age=(\d+)/.exec(cookie)?.[1]);
    expect(maxAge).toBeGreaterThan(12 * 60 * 60);
    expect(maxAge).toBeLessThanOrEqual(13 * 60 * 60);
    const body = await response.json() as Record<string, unknown>;
    expect(body.accessToken).toBe('access-token');
    expect(body.refreshToken).toBeUndefined();
    expect(body.sessionExpiresAt).toBeUndefined();
  });

  it('renova usando o cookie e apaga o mesmo cookie no logout', async () => {
    const headers = { Origin: origin, Cookie: `${REFRESH_TOKEN_COOKIE}=existing-refresh` };
    const renewed = await fetch(`${baseUrl}/refresh`, { method: 'POST', headers });
    expect(renewed.status).toBe(200);
    expect(auth.refresh).toHaveBeenCalledWith('existing-refresh', expect.any(Object));
    expect(renewed.headers.get('set-cookie')).toContain('SameSite=None');

    const loggedOut = await fetch(`${baseUrl}/logout`, { method: 'POST', headers });
    expect(loggedOut.status).toBe(204);
    expect(auth.logout).toHaveBeenCalledWith('existing-refresh', expect.any(Object));
    const clearedCookie = loggedOut.headers.get('set-cookie');
    expect(clearedCookie).toContain('Expires=Thu, 01 Jan 1970');
    expect(clearedCookie).toContain('SameSite=None');
    expect(clearedCookie).toContain('Partitioned');
  });

  it.each(['login', 'refresh', 'logout'])('bloqueia %s de origem externa, ausente ou null antes de alterar a sessao', async (path) => {
    for (const untrustedOrigin of ['https://attacker.example', undefined, 'null', `${origin}.attacker.example`]) {
      const headers: Record<string, string> = { Cookie: `${REFRESH_TOKEN_COOKIE}=existing-refresh` };
      if (untrustedOrigin) headers.Origin = untrustedOrigin;
      const response = await fetch(`${baseUrl}/${path}`, { method: 'POST', headers });
      expect(response.status).toBe(403);
      expect(response.headers.get('set-cookie')).toBeNull();
    }
    expect(auth.login).not.toHaveBeenCalled();
    expect(auth.refresh).not.toHaveBeenCalled();
    expect(auth.logout).not.toHaveBeenCalled();
  });

  it('cookie local permanece Strict e sem Partitioned', async () => {
    config.set('AUTH_COOKIE_SECURE', false);
    config.set('AUTH_COOKIE_SAME_SITE', 'strict');
    const response = await fetch(`${baseUrl}/login`, { method: 'POST', headers: { Origin: origin } });
    const cookie = response.headers.get('set-cookie');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).not.toContain('Partitioned');
    expect(cookie).not.toContain('Secure');
  });

  it('sem cookie retorna 401 para novo login, sem chamar a rotacao', async () => {
    const response = await fetch(`${baseUrl}/refresh`, { method: 'POST', headers: { Origin: origin } });
    expect(response.status).toBe(401);
    expect(auth.refresh).not.toHaveBeenCalled();
  });
});
