import { validateEnvironment } from './environment.validation';

const environment = {
  DATABASE_URL: 'postgresql://app:example@localhost:5432/estoque_revisao_test',
  JWT_ACCESS_SECRET: 'test-secret-with-at-least-32-characters',
};

describe('cookie de renovacao por ambiente', () => {
  it('mantem Strict localmente e a sessao de 14 horas com acesso curto', () => {
    const config = validateEnvironment(environment);
    expect(config.AUTH_COOKIE_SAME_SITE).toBe('strict');
    expect(config.JWT_ACCESS_TTL).toBe('15m');
    expect(config.REFRESH_TOKEN_TTL_HOURS).toBe(14);
  });

  it('permite frontend HTTPS externo sem exigir uma nova variavel no deploy', () => {
    const config = validateEnvironment({
      ...environment, FRONTEND_URL: 'https://frontend.pages.dev', AUTH_COOKIE_SECURE: 'true',
    });
    expect(config.AUTH_COOKIE_SAME_SITE).toBe('none');
    expect(config.AUTH_COOKIE_SECURE).toBe(true);
  });

  it.each(['localhost', '127.0.0.1'])('preserva Strict em %s mesmo com Secure', (host) => {
    const config = validateEnvironment({
      ...environment, FRONTEND_URL: `https://${host}:5173`, AUTH_COOKIE_SECURE: 'true',
    });
    expect(config.AUTH_COOKIE_SAME_SITE).toBe('strict');
  });

  it('respeita Strict explicito quando a API esta no mesmo site', () => {
    const config = validateEnvironment({
      ...environment, FRONTEND_URL: 'https://frontend.example.com',
      AUTH_COOKIE_SECURE: 'true', AUTH_COOKIE_SAME_SITE: 'strict',
    });
    expect(config.AUTH_COOKIE_SAME_SITE).toBe('strict');
  });

  it('recusa None sem Secure e valores desconhecidos', () => {
    expect(() => validateEnvironment({ ...environment, AUTH_COOKIE_SAME_SITE: 'none' }))
      .toThrow('AUTH_COOKIE_SAME_SITE=none exige AUTH_COOKIE_SECURE=true');
    expect(() => validateEnvironment({ ...environment, AUTH_COOKIE_SAME_SITE: 'invalid' }))
      .toThrow('Configuracao de ambiente invalida');
  });
});
