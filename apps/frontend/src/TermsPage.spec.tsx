import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TermsPage } from './TermsPage';

describe('link de privacidade nos termos de uso', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    undefined,
    ' ',
    '/privacidade',
    'javascript:alert(1)',
    'http://policy.example.test/privacidade',
    'https://user:password@policy.example.test/privacidade',
  ])('omite o link quando a configuração não é uma URL HTTPS válida: %s', (url) => {
    vi.stubEnv('VITE_PRIVACY_POLICY_URL', url);
    const html = renderToStaticMarkup(<TermsPage />);
    expect(html).toContain('Privacidade e registros');
    expect(html).not.toContain('Política de privacidade do Estoque Revisão');
  });

  it('vincula a seção de privacidade diretamente à URL configurada', () => {
    const url = 'https://policy.example.test/privacidade';
    vi.stubEnv('VITE_PRIVACY_POLICY_URL', url);
    expect(renderToStaticMarkup(<TermsPage />)).toContain(`<a href="${url}">Política de privacidade do Estoque Revisão</a>`);
  });
});
