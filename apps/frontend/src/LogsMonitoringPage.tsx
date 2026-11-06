import { useEffect, useState } from 'react';
import { api } from './api';
import {
  LogFilterParams,
  PaginatedLogs,
  SystemLog,
  SystemLogLevel,
  SystemLogMetrics,
} from './logs-monitoring.types';

export function LogsMonitoringPage() {
  const [logs, setLogs] = useState<PaginatedLogs | null>(null);
  const [metrics, setMetrics] = useState<SystemLogMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<SystemLog | null>(null);

  // Filtros
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState<string>('');
  const [errorCode, setErrorCode] = useState('');
  const [context, setContext] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const limit = 15;

  const fetchMetrics = async () => {
    setLoadingMetrics(true);
    try {
      const data = await api.get<SystemLogMetrics>('/logs/metrics');
      setMetrics(data);
    } catch (err) {
      console.error('Falha ao carregar métricas de logs:', err);
    } finally {
      setLoadingMetrics(false);
    }
  };

  const fetchLogs = async (currentPage = page) => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams();
      queryParams.set('page', String(currentPage));
      queryParams.set('limit', String(limit));
      if (search) queryParams.set('search', search);
      if (level) queryParams.set('level', level);
      if (errorCode) queryParams.set('errorCode', errorCode);
      if (context) queryParams.set('context', context);
      if (startDate) queryParams.set('startDate', new Date(startDate).toISOString());
      if (endDate) queryParams.set('endDate', new Date(endDate).toISOString());

      const data = await api.get<PaginatedLogs>(`/logs?${queryParams.toString()}`);
      setLogs(data);
    } catch (err) {
      console.error('Falha ao buscar logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    fetchLogs(1);
  }, []);

  const handleApplyFilters = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchLogs(1);
  };

  const handleClearFilters = () => {
    setSearch('');
    setLevel('');
    setErrorCode('');
    setContext('');
    setStartDate('');
    setEndDate('');
    setPage(1);
    setTimeout(() => {
      fetchLogs(1);
    }, 0);
  };

  const handleSimulate = async (type: 'conflict' | 'not-found' | 'database' | 'crash', repeat = 1) => {
    setSimulating(true);
    setSimulationResult(null);
    try {
      for (let i = 0; i < repeat; i++) {
        try {
          await api.post('/products/simulate-failure', { type });
        } catch (error: any) {
          if (i === repeat - 1) {
            setSimulationResult(`Resposta HTTP: ${error.status ?? 'Erro'} | Código: ${error.code ?? 'ERRO'} | Mensagem: ${error.message}`);
          }
        }
      }
      await fetchMetrics();
      await fetchLogs(1);
    } finally {
      setSimulating(false);
    }
  };

  const getLevelBadgeClass = (lvl: SystemLogLevel) => {
    switch (lvl) {
      case 'FATAL':
      case 'ERROR':
        return 'badge-error';
      case 'WARN':
        return 'badge-warn';
      case 'INFO':
      default:
        return 'badge-info';
    }
  };

  return (
    <div className="logs-monitoring-container" style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 600 }}>Gerenciamento e Monitoramento de Logs</h1>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--color-text-muted, #666)' }}>
            Observabilidade contínua de eventos, falhas esperadas/inesperadas, métricas e alertas em tempo real.
          </p>
        </div>
        <button
          className="secondary"
          onClick={() => {
            fetchMetrics();
            fetchLogs(page);
          }}
          disabled={loading || loadingMetrics}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1rem' }}
        >
          <span>🔄</span>
          <span>Atualizar Dados</span>
        </button>
      </div>

      {/* Condição de Alerta */}
      {metrics?.alert && (
        <div
          style={{
            padding: '1rem 1.25rem',
            borderRadius: '8px',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            border: metrics.alert.triggered ? '2px solid #ef4444' : '1px solid #10b981',
            backgroundColor: metrics.alert.triggered ? '#fee2e2' : '#ecfdf5',
            color: metrics.alert.triggered ? '#991b1b' : '#065f46',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '1.1rem' }}>
              <span>{metrics.alert.triggered ? '🚨' : '✅'}</span>
              <span>
                {metrics.alert.triggered
                  ? 'CONDIÇÃO DE ALERTA DISPARADA (CRÍTICO)'
                  : metrics.alert.status === 'WARNING'
                  ? 'ATENÇÃO OPERACIONAL'
                  : 'SISTEMA OPERACIONAL ESTÁVEL'}
              </span>
            </div>
            <p style={{ margin: '0.35rem 0 0', fontSize: '0.95rem' }}>{metrics.alert.message}</p>
          </div>
          <div style={{ textAlign: 'right', fontSize: '0.85rem' }}>
            <div><strong>Regra:</strong> {metrics.alert.condition}</div>
            <div><strong>Janela:</strong> últimos {metrics.alert.windowMinutes} minutos ({metrics.alert.criticalErrorsInWindow} ocorrências)</div>
          </div>
        </div>
      )}

      {/* Cards de Métricas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="surface" style={{ padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color, #e5e7eb)' }}>
          <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>Total de Eventos</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, marginTop: '0.25rem' }}>{metrics?.totalLogs ?? 0}</div>
        </div>
        <div className="surface" style={{ padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color, #e5e7eb)', borderLeft: '4px solid #ef4444' }}>
          <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>Erros Críticos (ERROR/FATAL)</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#ef4444', marginTop: '0.25rem' }}>
            {(metrics?.countsByLevel.ERROR ?? 0) + (metrics?.countsByLevel.FATAL ?? 0)}
          </div>
        </div>
        <div className="surface" style={{ padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color, #e5e7eb)', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>Falhas Esperadas (WARN)</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#d97706', marginTop: '0.25rem' }}>
            {metrics?.countsByLevel.WARN ?? 0}
          </div>
        </div>
        <div className="surface" style={{ padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color, #e5e7eb)', borderLeft: '4px solid #3b82f6' }}>
          <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>Eventos Informativos (INFO)</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#2563eb', marginTop: '0.25rem' }}>
            {metrics?.countsByLevel.INFO ?? 0}
          </div>
        </div>
        <div className="surface" style={{ padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color, #e5e7eb)' }}>
          <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>Taxa Geral de Falhas</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, marginTop: '0.25rem' }}>
            {metrics?.errorRatePercentage ?? 0}%
          </div>
        </div>
      </div>

      {/* Painel de Simulação de Falhas e Alertas */}
      <div className="surface" style={{ padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--border-color, #e5e7eb)', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 600, margin: '0 0 0.5rem' }}>
          🧪 Simulação de Falhas & Teste de Alerta (Requisito 1 & 4)
        </h2>
        <p style={{ margin: '0 0 1rem', fontSize: '0.9rem', color: '#6b7280' }}>
          Dispare testes controlados no endpoint existente de Produtos para verificar o tratamento de falhas padronizado e a gravação estruturada no log.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
          <button
            type="button"
            className="secondary"
            onClick={() => handleSimulate('conflict')}
            disabled={simulating}
            style={{ borderColor: '#f59e0b', color: '#b45309' }}
          >
            ⚠️ Falha Esperada: Conflito (409)
          </button>

          <button
            type="button"
            className="secondary"
            onClick={() => handleSimulate('not-found')}
            disabled={simulating}
            style={{ borderColor: '#f59e0b', color: '#b45309' }}
          >
            🔍 Falha Esperada: Não Encontrado (404)
          </button>

          <button
            type="button"
            className="secondary"
            onClick={() => handleSimulate('database')}
            disabled={simulating}
            style={{ borderColor: '#ef4444', color: '#b91c1c' }}
          >
            🛑 Falha Inesperada: Banco Indisponível (503)
          </button>

          <button
            type="button"
            className="secondary"
            onClick={() => handleSimulate('crash')}
            disabled={simulating}
            style={{ borderColor: '#ef4444', color: '#b91c1c' }}
          >
            💥 Falha Inesperada: Erro Interno (500)
          </button>

          <button
            type="button"
            className="primary"
            onClick={() => handleSimulate('database', 11)}
            disabled={simulating}
            style={{ backgroundColor: '#dc2626', borderColor: '#b91c1c' }}
          >
            🚨 Disparar Rajada (11 Erros) para Ativar Alerta
          </button>
        </div>

        {simulationResult && (
          <div style={{ marginTop: '0.85rem', padding: '0.65rem 0.85rem', backgroundColor: '#f3f4f6', borderRadius: '6px', fontSize: '0.85rem', fontFamily: 'monospace' }}>
            {simulationResult}
          </div>
        )}
      </div>

      {/* Erros Recorrentes */}
      {metrics && metrics.topRecurringErrors.length > 0 && (
        <div className="surface" style={{ padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--border-color, #e5e7eb)', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 600, margin: '0 0 0.75rem' }}>
            📊 Erros Recorrentes Identificados (Requisito 4)
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                  <th style={{ padding: '0.5rem' }}>Código do Erro</th>
                  <th style={{ padding: '0.5rem' }}>Severidade</th>
                  <th style={{ padding: '0.5rem' }}>Ocorrências</th>
                  <th style={{ padding: '0.5rem' }}>% do Total de Erros</th>
                  <th style={{ padding: '0.5rem' }}>Última Ocorrência</th>
                  <th style={{ padding: '0.5rem' }}>Exemplo da Mensagem</th>
                </tr>
              </thead>
              <tbody>
                {metrics.topRecurringErrors.map((err) => (
                  <tr key={err.errorCode} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '0.5rem', fontWeight: 600, fontFamily: 'monospace' }}>{err.errorCode}</td>
                    <td style={{ padding: '0.5rem' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700,
                        backgroundColor: err.severity === 'WARN' ? '#fef3c7' : '#fee2e2',
                        color: err.severity === 'WARN' ? '#92400e' : '#991b1b',
                      }}>
                        {err.severity}
                      </span>
                    </td>
                    <td style={{ padding: '0.5rem', fontWeight: 700 }}>{err.count}</td>
                    <td style={{ padding: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: '60px', height: '8px', backgroundColor: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(err.percentage, 100)}%`, height: '100%', backgroundColor: err.severity === 'WARN' ? '#f59e0b' : '#ef4444' }} />
                        </div>
                        <span>{err.percentage}%</span>
                      </div>
                    </td>
                    <td style={{ padding: '0.5rem', fontSize: '0.85rem' }}>{new Date(err.lastOccurrence).toLocaleTimeString()}</td>
                    <td style={{ padding: '0.5rem', fontSize: '0.85rem', color: '#4b5563', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {err.sampleDescription}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Formulário de Busca e Filtros */}
      <div className="surface" style={{ padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--border-color, #e5e7eb)', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 600, margin: '0 0 1rem' }}>
          🔍 Busca e Filtragem de Logs (Requisito 3)
        </h2>
        <form onSubmit={handleApplyFilters} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem' }}>Palavra-chave / Descrição</label>
            <input
              type="text"
              placeholder="Ex: banco, produto, duplicado..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem' }}>Nível de Criticidade</label>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db' }}
            >
              <option value="">Todos os Níveis</option>
              <option value="INFO">INFO</option>
              <option value="WARN">WARN (Falhas Esperadas)</option>
              <option value="ERROR">ERROR (Falhas Inesperadas)</option>
              <option value="FATAL">FATAL (Crítico / Banco)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem' }}>Código do Erro</label>
            <input
              type="text"
              placeholder="Ex: PRODUCT_NOT_FOUND"
              value={errorCode}
              onChange={(e) => setErrorCode(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem' }}>Classe / Origem</label>
            <input
              type="text"
              placeholder="Ex: ProductsController"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem' }}>Data/Hora Início</label>
            <input
              type="datetime-local"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem' }}>Data/Hora Fim</label>
            <input
              type="datetime-local"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
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

      {/* Tabela de Logs */}
      <div className="surface" style={{ padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--border-color, #e5e7eb)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 600, margin: 0 }}>
            Registros de Logs Estruturados ({logs?.meta.total ?? 0})
          </h2>
          <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
            Página {logs?.meta.page ?? 1} de {logs?.meta.totalPages || 1}
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Carregando registros de logs...</div>
        ) : !logs || logs.items.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Nenhum log encontrado para os filtros selecionados.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left', backgroundColor: '#f9fafb' }}>
                  <th style={{ padding: '0.6rem 0.5rem' }}>Data / Hora</th>
                  <th style={{ padding: '0.6rem 0.5rem' }}>Nível</th>
                  <th style={{ padding: '0.6rem 0.5rem' }}>Código do Erro</th>
                  <th style={{ padding: '0.6rem 0.5rem' }}>Event ID</th>
                  <th style={{ padding: '0.6rem 0.5rem' }}>Classe de Origem</th>
                  <th style={{ padding: '0.6rem 0.5rem' }}>Descrição do Evento</th>
                  <th style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {logs.items.map((log) => (
                  <tr key={log.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '0.5rem', whiteSpace: 'nowrap', color: '#4b5563' }}>
                      {new Date(log.timestamp).toLocaleString('pt-BR')}
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700,
                        backgroundColor:
                          log.level === 'FATAL' || log.level === 'ERROR' ? '#fee2e2' :
                          log.level === 'WARN' ? '#fef3c7' : '#dbeafe',
                        color:
                          log.level === 'FATAL' || log.level === 'ERROR' ? '#991b1b' :
                          log.level === 'WARN' ? '#92400e' : '#1e40af',
                      }}>
                        {log.level}
                      </span>
                    </td>
                    <td style={{ padding: '0.5rem', fontFamily: 'monospace', fontWeight: 600 }}>
                      {log.errorCode || '-'}
                    </td>
                    <td style={{ padding: '0.5rem', fontFamily: 'monospace', fontSize: '0.8rem', color: '#6b7280' }} title={log.eventId}>
                      {log.eventId.length > 12 ? `${log.eventId.substring(0, 12)}…` : log.eventId}
                    </td>
                    <td style={{ padding: '0.5rem', color: '#374151' }}>
                      {log.context}
                    </td>
                    <td style={{ padding: '0.5rem', maxWidth: '350px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.description}>
                      {log.description}
                    </td>
                    <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setSelectedLog(log)}
                        style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                      >
                        Ver Detalhes
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginação */}
        {logs && logs.meta.totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1.25rem' }}>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                const prev = Math.max(page - 1, 1);
                setPage(prev);
                fetchLogs(prev);
              }}
              disabled={page <= 1 || loading}
            >
              Anterior
            </button>
            <span style={{ display: 'flex', alignItems: 'center', padding: '0 0.5rem', fontSize: '0.9rem' }}>
              Página {page} de {logs.meta.totalPages}
            </span>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                const next = Math.min(page + 1, logs.meta.totalPages);
                setPage(next);
                fetchLogs(next);
              }}
              disabled={page >= logs.meta.totalPages || loading}
            >
              Próxima
            </button>
          </div>
        )}
      </div>

      {/* Modal de Detalhes do Log */}
      {selectedLog && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div className="surface" style={{
            width: '90%', maxWidth: '750px', maxHeight: '90vh', overflowY: 'auto',
            padding: '1.5rem', borderRadius: '8px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Detalhes da Ocorrência de Log</h3>
              <button type="button" className="secondary" onClick={() => setSelectedLog(null)} style={{ padding: '0.25rem 0.5rem' }}>
                ✕
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem', fontSize: '0.9rem' }}>
              <div><strong>Identificador (ID):</strong> <span style={{ fontFamily: 'monospace' }}>{selectedLog.id}</span></div>
              <div><strong>Event ID / Request ID:</strong> <span style={{ fontFamily: 'monospace' }}>{selectedLog.eventId}</span></div>
              <div><strong>Data / Hora:</strong> {new Date(selectedLog.timestamp).toISOString()}</div>
              <div><strong>Nível:</strong> {selectedLog.level}</div>
              <div><strong>Código do Erro:</strong> <span style={{ fontFamily: 'monospace' }}>{selectedLog.errorCode || 'N/A'}</span></div>
              <div><strong>Classe / Origem:</strong> {selectedLog.context}</div>
              <div><strong>Ambiente:</strong> {selectedLog.environment}</div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <strong>Descrição:</strong>
              <div style={{ marginTop: '0.25rem', padding: '0.5rem', backgroundColor: '#f9fafb', borderRadius: '4px', border: '1px solid #e5e7eb' }}>
                {selectedLog.description}
              </div>
            </div>

            <div>
              <strong>Metadados & Detalhes Estruturados (JSON Sanitizado):</strong>
              <pre style={{
                marginTop: '0.5rem', padding: '1rem', backgroundColor: '#1e293b', color: '#f8fafc',
                borderRadius: '6px', fontSize: '0.85rem', overflowX: 'auto', maxHeight: '250px',
              }}>
                {JSON.stringify(selectedLog.details, null, 2) || '{}'}
              </pre>
            </div>

            <div style={{ textAlign: 'right', marginTop: '1.25rem' }}>
              <button type="button" className="primary" onClick={() => setSelectedLog(null)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

