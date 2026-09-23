import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OperationalSectorSwitcher } from './App';

describe('Alternância operacional do administrador', () => {
  it('oferece o modo Admin e os quatro setores em um seletor acessível', () => {
    const html = renderToStaticMarkup(<OperationalSectorSwitcher value="ADMIN" onChange={() => undefined} />);
    expect(html).toContain('aria-label="Modo operacional"');
    expect(html).toContain('Admin');
    expect(html).toContain('Revisão');
    expect(html).toContain('Produção');
    expect(html).toContain('Expedição');
    expect(html).toContain('PCP');
  });
});
