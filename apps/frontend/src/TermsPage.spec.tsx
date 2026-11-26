import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TermsPage } from './TermsPage';

describe('termos de uso', () => {
  it('liga as duas apresentações do índice aos nove tópicos e às fontes', () => {
    const html = renderToStaticMarkup(<TermsPage />);
    const headings = [...html.matchAll(/<h2 id="([^"]+)" tabindex="-1">/g)].map((match) => match[1]);
    expect(headings).toHaveLength(10);
    expect(new Set(headings).size).toBe(headings.length);
    expect(headings).toContain('terms-sources');
    for (const id of headings) expect(html.split(`href="#${id}"`)).toHaveLength(3);
  });

  it('mantém a referência genérica ao responsável e o texto de privacidade sem link de política', () => {
    const html = renderToStaticMarkup(<TermsPage />);
    expect(html).toContain('procure o responsável pela plataforma');
    expect(html).toContain('Privacidade e registros');
    expect(html).not.toContain('Política de privacidade do Estoque Revisão');
    expect(html).not.toContain('Dúvidas pendentes');
  });
});
