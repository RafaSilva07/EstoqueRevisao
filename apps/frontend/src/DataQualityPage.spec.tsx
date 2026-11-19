// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { DataQualityPage } from './DataQualityPage';
import { DataQualityReport } from './data-quality.types';

describe('DataQualityPage — Painel de Qualidade dos Dados', () => {
  it('renderiza o índice de qualidade, dimensões e não conformidades detectadas', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const mockReport: DataQualityReport = {
      generatedAt: '2026-11-19T09:00:00.000Z',
      overallScore: 82,
      status: 'CRITICAL',
      summary: {
        totalRecordsChecked: 20,
        totalIssues: 2,
        highSeverity: 1,
        mediumSeverity: 1,
        lowSeverity: 0,
      },
      dimensions: [
        { dimension: 'COMPLETENESS', label: 'Completude Cadastral', score: 90, checkedCount: 10, issueCount: 1 },
        { dimension: 'VALIDITY', label: 'Validade de Lotes', score: 74, checkedCount: 10, issueCount: 1 },
        { dimension: 'CONSISTENCY', label: 'Consistência de Saldos', score: 100, checkedCount: 10, issueCount: 0 },
        { dimension: 'TIMELINESS', label: 'Tempestividade Operacional', score: 100, checkedCount: 2, issueCount: 0 },
      ],
      issues: [
        {
          id: 'EXPIRED_BATCH_WITH_STOCK:1',
          ruleCode: 'EXPIRED_BATCH_WITH_STOCK',
          dimension: 'VALIDITY',
          severity: 'HIGH',
          entityType: 'STOCK_POSITION',
          entityId: 'pos-1',
          referenceCode: 'PRD-001 / Lote L99',
          title: 'Lote vencido com saldo ativo em estoque',
          description: 'Posição no local "Geral" mantém saldo de 5 com validade expirada.',
          recommendation: 'Realize revisão/baixa do lote vencido.',
        },
        {
          id: 'PRODUCT_MISSING_WEIGHT:2',
          ruleCode: 'PRODUCT_MISSING_WEIGHT',
          dimension: 'COMPLETENESS',
          severity: 'MEDIUM',
          entityType: 'PRODUCT',
          entityId: 'prod-2',
          referenceCode: 'PRD-002',
          title: 'Produto ativo sem peso unitário',
          description: 'O produto não possui peso unitário em gramas preenchido.',
          recommendation: 'Acesse o cadastro de Produtos e informe o peso unitário.',
        },
      ],
    };

    const getSpy = vi.spyOn(api, 'get').mockResolvedValue(mockReport);
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(<DataQualityPage />);
    });
    for (let i = 0; i < 20 && !host.textContent?.includes('Índice de Qualidade: 82%'); i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });
    }

    expect(getSpy).toHaveBeenCalledWith('/data-quality/report');
    expect(host.textContent).toContain('Índice de Qualidade: 82%');
    expect(host.textContent).toContain('Completude Cadastral');
    expect(host.textContent).toContain('PRD-001 / Lote L99');
    expect(host.textContent).toContain('Lote vencido com saldo ativo em estoque');
    expect(host.textContent).toContain('Produto ativo sem peso unitário');

    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });
});
