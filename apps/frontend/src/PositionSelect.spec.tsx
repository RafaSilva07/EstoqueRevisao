import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PositionSelect } from './PositionSelect';

describe('Seleção de posição', () => {
  it('exibe os dados completos da opção selecionada sem popup nativo', () => {
    const label = 'Revisar · lote: CICINV · prod: 09/09/2026 · val: 09/09/2029 · saldo: 30';
    const html = renderToStaticMarkup(<PositionSelect label="Posição disponível *" value="p" options={[{ value: 'p', label }]} onChange={() => undefined} />);
    expect(html).toContain(label);
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('<select');
  });
  it('respeita o bloqueio e o texto de carregamento', () => {
    const html = renderToStaticMarkup(<PositionSelect label="Lote" value="" options={[]} disabled placeholder="Consultando…" onChange={() => undefined} />);
    expect(html).toContain('disabled=""');
    expect(html).toContain('Consultando…');
  });
});
