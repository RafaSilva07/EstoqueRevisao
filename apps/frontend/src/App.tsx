import { useEffect, useState } from 'react';

type HealthState = 'checking' | 'online' | 'offline';

const configuredApiUrl: unknown = import.meta.env.VITE_API_URL;
const apiUrl = typeof configuredApiUrl === 'string'
  ? configuredApiUrl
  : 'http://localhost:3000/api/v1';

export function App() {
  const [health, setHealth] = useState<HealthState>('checking');

  useEffect(() => {
    const controller = new AbortController();

    void fetch(`${apiUrl}/health`, { signal: controller.signal })
      .then((response) => setHealth(response.ok ? 'online' : 'offline'))
      .catch(() => setHealth('offline'));

    return () => controller.abort();
  }, []);

  return (
    <main className="page-shell">
      <section className="status-card" aria-labelledby="page-title">
        <p className="eyebrow">Fundacao tecnica</p>
        <h1 id="page-title">Estoque Revisao</h1>
        <p>
          A base da aplicacao esta pronta para receber os modulos do MVP de forma
          incremental.
        </p>
        <div className={`health health--${health}`} role="status">
          <span aria-hidden="true" />
          API {health === 'checking' ? 'em verificacao' : health === 'online' ? 'online' : 'indisponivel'}
        </div>
      </section>
    </main>
  );
}
