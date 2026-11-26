import { useLayoutEffect, useRef } from 'react';

const documentation = 'https://github.com/RafaSilva07/EstoqueRevisao/blob/develop/documentos';
const sources = [
  { file: 'REGRAS_NEGOCIO.md', label: 'Regras de negócio do EstoqueRevisao' },
  { file: 'FUNCIONALIDADES.md', label: 'Funcionalidades implementadas' },
  { file: 'ARQUITETURA.md', label: 'Arquitetura, autenticação e autorização' },
];

export function TermsPage() {
  const heading = useRef<HTMLHeadingElement>(null);

  useLayoutEffect(() => {
    const previousTitle = document.title;
    document.title = 'Termos de uso | Estoque Revisão';
    heading.current?.focus({ preventScroll: true });
    return () => { document.title = previousTitle; };
  }, []);

  return <article className="terms-page surface" aria-labelledby="terms-title">
    <header className="terms-header">
      <p className="terms-status">Rascunho educacional</p>
      <h1 ref={heading} id="terms-title" tabIndex={-1}>Termos de uso</h1>
      <p className="terms-intro">Orientações para o uso do Estoque Revisão. A consulta é informativa e dispensa aceite.</p>
      <dl className="terms-metadata">
        <div><dt>Versão</dt><dd>0.1</dd></div>
        <div><dt>Elaboração</dt><dd>Rafael Silva e João Victor Fernandes</dd></div>
      </dl>
    </header>

    <div className="terms-content">
      <div className="terms-body">
        <section>
          <h2>Público-alvo e finalidade</h2>
          <p>Este documento é destinado às pessoas que usam o Estoque Revisão e a quem acompanha a atividade educacional. O sistema registra produtos, lotes, saldos e movimentações de estoque.</p>
        </section>
        <section>
          <h2>Conta e permissões</h2>
          <p>Use a conta atribuída a você. As funções de consulta e operação disponíveis dependem das permissões da conta e do modo operacional ativo.</p>
        </section>
        <section>
          <h2>Operações, registros e fotos</h2>
          <p>Confira os dados antes de confirmar uma operação. O sistema mantém histórico de movimentações e registra eventos de auditoria. As fotos anexadas aos itens de um envio ficam disponíveis às contas autorizadas a consultar esse envio.</p>
        </section>
      </div>
      <section className="terms-sources">
        <h2>Fontes consultadas</h2>
        <p id="terms-source-note">Os links abrem em uma nova aba.</p>
        <ul role="list">
          {sources.map(({ file, label }) => <li key={file}>
            <a href={`${documentation}/${file}`} target="_blank" rel="noopener" aria-describedby="terms-source-note"
              onFocus={({ currentTarget }) => {
                if (currentTarget.matches(':focus-visible')) currentTarget.scrollIntoView({ block: 'nearest', behavior: 'instant' });
              }}>
              <span>{label}</span><span aria-hidden="true">↗</span>
            </a>
          </li>)}
        </ul>
      </section>
    </div>
  </article>;
}
