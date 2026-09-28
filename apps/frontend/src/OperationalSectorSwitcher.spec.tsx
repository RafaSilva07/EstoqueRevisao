import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OperationalSectorSwitcher } from './App';

describe('Alternância operacional do administrador', () => {
  it('oferece o modo Admin e os quatro setores em um seletor acessível', () => {
    const html = renderToStaticMarkup(<OperationalSectorSwitcher value="ADMIN" modes={['ADMIN', 'REVISAO', 'PRODUCAO', 'EXPEDICAO', 'PCP']} onChange={() => undefined} />);
    expect(html).toContain('aria-label="Modo operacional"');
    expect(html).toContain('Admin geral');
    expect(html).toContain('Revisão');
    expect(html).toContain('Produção');
    expect(html).toContain('Expedição');
    expect(html).toContain('PCP');
  });

  it('mostra somente os setores permitidos ao administrador de área', () => {
    const html = renderToStaticMarkup(<OperationalSectorSwitcher value="PRODUCAO" modes={['PRODUCAO', 'PCP']} onChange={() => undefined} />);
    expect(html).toContain('Produção');
    expect(html).toContain('PCP');
    expect(html).not.toContain('value="ADMIN"');
    expect(html).not.toContain('Expedição');
  });
});
