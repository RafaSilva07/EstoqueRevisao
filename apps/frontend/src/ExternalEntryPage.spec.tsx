// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, StockLocation } from './api';
import { ExternalEntryPage } from './ExternalEntryPage';

const location = (id: string, name: string, kind: StockLocation['kind'], sector: string | null = null) =>
  ({ id, name, code: id, kind, sector, active: true }) as StockLocation;
const result = (items: unknown[]) => ({ items, meta: { total: items.length, page: 1, limit: 100, totalPages: 1 } });
let host: HTMLDivElement;
let root: Root;
const onManageLocations = vi.fn();

async function render(origins: StockLocation[]) {
  vi.spyOn(api, 'get').mockImplementation(async (path) => {
    await Promise.resolve();
    if (path.includes('kind=EXTERNAL')) return result(origins);
    if (path.startsWith('/stocks?')) return result([location('review', 'Revisar', 'SUBSTOCK')]);
    return result([]);
  });
  await act(async () => { root.render(<ExternalEntryPage onCreated={() => undefined} onManageLocations={onManageLocations} />); await Promise.resolve(); });
}

describe('origem da entrada manual', () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  });
  afterEach(async () => { await act(async () => { root.unmount(); await Promise.resolve(); }); host.remove(); vi.restoreAllMocks(); vi.clearAllMocks(); });

  it('permite selecionar origens externas comuns e setores na entrada manual', async () => {
    await render([location('supplier', 'Fornecedor', 'EXTERNAL'), location('production', 'Produção', 'EXTERNAL', 'PRODUCAO'),
      location('expedition', 'Expedição', 'EXTERNAL', 'EXPEDICAO')]);
    const origin = Array.from(host.querySelectorAll('select')).find((select) => select.parentElement?.textContent?.includes('Origem externa'));
    expect(origin?.textContent).toContain('Fornecedor');
    expect(origin?.textContent).toContain('Produção');
    expect(origin?.textContent).toContain('Expedição');
    expect(host.textContent).toContain('credita o estoque imediatamente');
    expect(host.textContent).not.toContain('Não há origem externa ativa cadastrada');
  });

  it('orienta o cadastro quando não existe origem manual disponível', async () => {
    await render([]);
    expect(host.textContent).toContain('Não há origem externa ativa cadastrada');
    const button = Array.from(host.querySelectorAll('button')).find((item) => item.textContent === 'Cadastrar origem externa');
    expect(button).toBeTruthy();
    await act(async () => { button!.click(); await Promise.resolve(); });
    expect(onManageLocations).toHaveBeenCalledOnce();
  });
});
