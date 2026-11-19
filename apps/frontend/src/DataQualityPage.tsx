import { useEffect, useState } from 'react';
import { api } from './api';
import {
  DataQualityDimension,
  DataQualityIssue,
  DataQualityReport,
  DataQualitySeverity,
} from './data-quality.types';

const DIMENSION_LABELS: Record<DataQualityDimension, string> = {
  COMPLETENESS: 'Completude',
  VALIDITY: 'Validade',
  CONSISTENCY: 'Consistência',
  TIMELINESS: 'Tempestividade',
};

const SEVERITY_LABELS: Record<DataQualitySeverity, string> = {
  HIGH: 'Alta',
  MEDIUM: 'Média',
  LOW: 'Baixa',
};

export function DataQualityPage() {
  const [report, setReport] = useState<DataQualityReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dimension, setDimension] = useState<string>('');
  const [severity, setSeverity] = useState<string>('');
  const [search, setSearch] = useState('');

  const fetchReport = async (
    nextDimension = dimension,
    nextSeverity = severity,
    nextSearch = search,
  ) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (nextDimension) params.set('dimension', nextDimension);
      if (nextSeverity) params.set('severity', nextSeverity);
      if (nextSearch.trim()) params.set('search', nextSearch.trim());
      const query = params.toString();
      const data = await api.get<DataQualityReport>(`/data-quality/report${query ? `?${query}` : ''}`);
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar o relatório de qualidade de dados.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchReport('', '', '');
  }, []);

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void fetchReport();
  };

  const handleClearFilters = () => {
    setDimension('');
    setSeverity('');
    setSearch('');
    void fetchReport('', '', '');
  };

  const handleExportCsv = () => {
    if (!report || report.issues.length === 0) return;
    const headers = ['Regra', 'Dimensão', 'Severidade', 'Entidade', 'Referência', 'Título', 'Descrição', 'Recomendação'];
    const escape = (val: string) => `"${val.replace(/"/g, '""')}"`;
    const rows = report.issues.map((issue) =>
      [
        issue.ruleCode,
        DIMENSION_LABELS[issue.dimension],
        SEVERITY_LABELS[issue.severity],
        issue.entityType,
        issue.referenceCode,
        issue.title,
        issue.description,
        issue.recommendation,
      ]
        .map(escape)
        .join(';'),
    );
    const csv = [headers.join(';'), ...rows].join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `qualidade-dados-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const statusColor = (status?: DataQualityReport['status']) => {
    if (status === 'CRITICAL') return { bg: '#fee2e2', border: '#ef4444', text: '#991b1b', label: 'CRÍTICO' };
    if (status === 'ATTENTION') return { bg: '#fef3c7', border: '#f59e0b', text: '#92400e', label: 'ATENÇÃO' };
    return { bg: '#ecfdf5', border: '#10b981', text: '#065f46', label: 'SAUDÁVEL' };
  };

  const severityBadgeStyle = (sev: DataQualitySeverity) => {
    if (sev === 'HIGH') return { backgroundColor: '#fee2e2', color: '#991b1b' };
    if (sev === 'MEDIUM') return { backgroundColor: '#fef3c7', color: '#92400e' };
    return { backgroundColor: '#dbeafe', color: '#1e40af' };
  };

  const st = statusColor(report?.status);

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 600 }}>Governança e Qualidade dos Dados</h1>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--color-text-muted, #666)' }}>
            Auditoria automática de completude cadastral, validade de lotes, consistência de saldos e tempestividade operacional.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="secondary"
            onClick={handleExportCsv}
            disabled={!report || report.issues.length === 0}
          >
            📥 Exportar CSV
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => void fetchReport()}
            disabled={loading}
          >
            {loading ? 'Analisando...' : '🔄 Executar Auditoria'}
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" style={{ padding: '1rem', borderRadius: '8px', backgroundColor: '#fee2e2', color: '#991b1b', marginBottom: '1.5rem' }}>
          {error}
        </div>
      )}

      {report && (
        <>
          {/* Banner Índice Geral */}
          <div
            style={{
              padding: '1.25rem',
              borderRadius: '8px',
              border: `2px solid ${st.border}`,
              backgroundColor: st.bg,
              color: st.text,
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '1rem',
              marginBottom: '1.5rem',
            }}
          >
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.04em' }}>
                STATUS DE GOVERNANÇA: {st.label}
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 800, marginTop: '0.25rem' }}>
                Índice de Qualidade: {report.overallScore}%
              </div>
              <div style={{ fontSize: '0.9rem', marginTop: '0.25rem' }}>
                {report.summary.totalRecordsChecked} registros avaliados • {report.summary.totalIssues} não conformidades encontradas
                ({report.summary.highSeverity} alta, {report.summary.mediumSeverity} média, {report.summary.lowSeverity} baixa)
              </div>
            </div>
            <div style={{ fontSize: '0.85rem', textAlign: 'right' }}>
              <div><strong>Última auditoria:</strong></div>
              <div>{new Date(report.generatedAt).toLocaleString('pt-BR')}</div>
            </div>
          </div>

          {/* Cards das Dimensões */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            {report.dimensions.map((dim) => (
              <div
                key={dim.dimension}
                className="surface"
                style={{
                  padding: '1rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color, #e5e7eb)',
                  borderLeft: `4px solid ${dim.score >= 95 ? '#10b981' : dim.score >= 75 ? '#f59e0b' : '#ef4444'}`,
                }}
              >
                <div style={{ fontSize: '0.85rem', color: '#6b7280', fontWeight: 600 }}>{dim.label}</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 700, margin: '0.25rem 0' }}>{dim.score}%</div>
                <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                  {dim.checkedCount} verificados • {dim.issueCount} alertas
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Filtros */}
      <div className="surface" style={{ padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--border-color, #e5e7eb)', marginBottom: '1.5rem' }}>
        <form onSubmit={handleFilterSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', alignItems: 'flex-end' }}>
          <div>
            <label htmlFor="dq-dimension" style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem' }}>Dimensão</label>
            <select
              id="dq-dimension"
              value={dimension}
              onChange={(e) => setDimension(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db' }}
            >
              <option value="">Todas as Dimensões</option>
              <option value="COMPLETENESS">Completude Cadastral</option>
              <option value="VALIDITY">Validade de Lotes</option>
              <option value="CONSISTENCY">Consistência de Saldos</option>
              <option value="TIMELINESS">Tempestividade Operacional</option>
            </select>
          </div>

          <div>
            <label htmlFor="dq-severity" style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem' }}>Severidade</label>
            <select
              id="dq-severity"
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db' }}
            >
              <option value="">Todas as Severidades</option>
              <option value="HIGH">Alta</option>
              <option value="MEDIUM">Média</option>
              <option value="LOW">Baixa</option>
            </select>
          </div>

          <div>
            <label htmlFor="dq-search" style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem' }}>Buscar Código / Regra</label>
            <input
              id="dq-search"
              type="text"
              placeholder="Ex: PRD-001, REM-..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" className="primary" style={{ flex: 1, padding: '0.55rem' }} disabled={loading}>
              Filtrar
            </button>
            <button type="button" className="secondary" onClick={handleClearFilters} style={{ padding: '0.55rem' }} disabled={loading}>
              Limpar
            </button>
          </div>
        </form>
      </div>

      {/* Tabela de Não Conformidades */}
      <div className="surface" style={{ padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--border-color, #e5e7eb)' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 600, margin: '0 0 1rem' }}>
          Não Conformidades Detectadas ({report?.issues.length ?? 0})
        </h2>

        {loading && !report ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Executando auditoria de qualidade...</div>
        ) : !report || report.issues.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#065f46', backgroundColor: '#ecfdf5', borderRadius: '6px' }}>
            Nenhuma inconsistência encontrada para os filtros selecionados. Todos os dados estão em conformidade!
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                  <th style={{ padding: '0.6rem 0.5rem' }}>Severidade</th>
                  <th style={{ padding: '0.6rem 0.5rem' }}>Dimensão</th>
                  <th style={{ padding: '0.6rem 0.5rem' }}>Referência</th>
                  <th style={{ padding: '0.6rem 0.5rem' }}>Problema Identificado</th>
                  <th style={{ padding: '0.6rem 0.5rem' }}>Ação Recomendada</th>
                </tr>
              </thead>
              <tbody>
                {report.issues.map((issue: DataQualityIssue) => (
                  <tr key={issue.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '0.6rem 0.5rem', whiteSpace: 'nowrap' }}>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          ...severityBadgeStyle(issue.severity),
                        }}
                      >
                        {SEVERITY_LABELS[issue.severity]}
                      </span>
                    </td>
                    <td style={{ padding: '0.6rem 0.5rem', whiteSpace: 'nowrap', fontWeight: 500 }}>
                      {DIMENSION_LABELS[issue.dimension]}
                    </td>
                    <td style={{ padding: '0.6rem 0.5rem', fontFamily: 'monospace', fontWeight: 600 }}>
                      {issue.referenceCode}
                    </td>
                    <td style={{ padding: '0.6rem 0.5rem' }}>
                      <div style={{ fontWeight: 600 }}>{issue.title}</div>
                      <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{issue.description}</div>
                    </td>
                    <td style={{ padding: '0.6rem 0.5rem', fontSize: '0.82rem', color: '#374151' }}>
                      {issue.recommendation}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
