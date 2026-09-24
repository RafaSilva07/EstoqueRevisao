import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PcpPage } from './PcpPage';
import { canExecutePcp } from './pcp';

describe('Fila PCP', () => {
  it('renderiza filtros obrigatorios e a fila padrao', () => {
    const html = renderToStaticMarkup(<PcpPage />);
    for (const text of ['Data inicial', 'Data final', 'Status operacional', 'Status PCP', 'Tipo', 'Origem', 'Destino', 'Código da movimentação, produto ou lote', 'Ordenação', 'Limpar filtros']) expect(html).toContain(text);
    expect(html).toContain('value="CONCLUIDA" selected=""');
    expect(html).toContain('value="PENDENTE" selected=""');
    expect(html).toContain('value="ASC" selected=""');
  });

  it('permite executar somente concluida e pendente no PCP', () => {
    expect(canExecutePcp({ operationalStatus: 'CONCLUIDA', pcpExecutionStatus: 'PENDENTE' })).toBe(true);
    expect(canExecutePcp({ operationalStatus: 'CANCELADA', pcpExecutionStatus: 'PENDENTE' })).toBe(false);
    expect(canExecutePcp({ operationalStatus: 'CONCLUIDA', pcpExecutionStatus: 'EXECUTADA' })).toBe(false);
  });
});
