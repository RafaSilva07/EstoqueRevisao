import { FormEvent, useRef, useState } from 'react';
import { api, UserSession } from './api';
import './login.css';

export function Login({ onAuthenticated }: { onAuthenticated: (user: UserSession) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [engaged, setEngaged] = useState(false);
  const submitting = useRef(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      onAuthenticated((await api.login(username, password)).user);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Ocorreu um erro inesperado.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return <main className="login-page" data-engaged={engaged} onPointerDown={() => setEngaged(true)} onKeyDown={() => setEngaged(true)}>
    <div className="login-layout">
      <section className="login-identity" aria-label="Estoque Revisão">
        <div className="login-brand"><span className="login-monogram" aria-hidden="true">ER</span><span>Estoque <strong>Revisão</strong></span></div>
        <div className="login-story">
          <p className="login-kicker">Organização em movimento</p>
          <h2>Tudo no lugar.<br /><span>Você no controle.</span></h2>
          <p>Produtos, lotes e movimentações.<br />Uma rotina mais simples começa aqui.</p>
          <div className="login-composition" aria-hidden="true">
            <div className="login-rack"><i /><i /><i /><i /><i /><i /></div>
            <span className="login-route"><i /></span>
            <div className="login-parcel"><span /><span /></div>
          </div>
          <p className="login-caption">Receber. Organizar. Movimentar.</p>
        </div>
      </section>

      <section className="login-form-area" aria-labelledby="login-title">
        <form className="login-card" onSubmit={(event) => void submit(event)}>
          <header className="login-heading"><p className="login-kicker">Acesse seu espaço de trabalho</p><h1 id="login-title">Bem-vindo de volta</h1><p>Entre com seu usuário e senha.</p></header>
          <div className="login-fields">
            <label className="login-field" htmlFor="username"><span>Usuário <small>obrigatório</small></span>
              <span className="login-input-wrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5 20v-2a7 7 0 0 1 14 0v2" /></svg><input id="username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(event) => setUsername(event.target.value)} required autoFocus readOnly={busy} aria-describedby={error ? 'login-error' : undefined} /></span>
            </label>
            <label className="login-field" htmlFor="password"><span>Senha <small>obrigatória</small></span>
              <span className="login-input-wrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 4v3" /></svg><input id="password" name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required readOnly={busy} aria-describedby={error ? 'login-error' : undefined} /></span>
            </label>
          </div>
          {error && <div className="login-error" id="login-error" role="alert"><span className="login-error-mark" aria-hidden="true">!</span><div><strong>Não foi possível entrar</strong><p>{error}</p></div></div>}
          <button className="login-submit" type="submit" disabled={busy} aria-busy={busy}>{busy ? <><span className="login-spinner" aria-hidden="true" /> Entrando…</> : <>Entrar no sistema <span aria-hidden="true">→</span></>}</button>
          <p className="login-status" role="status" aria-live="polite">{busy ? 'Verificando seu acesso. Aguarde um instante.' : 'Acesso com as permissões do seu perfil.'}</p>
        </form>
      </section>
    </div>
  </main>;
}
