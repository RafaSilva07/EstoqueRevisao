const documentation = 'https://github.com/RafaSilva07/EstoqueRevisao/blob/develop/documentos';

export function TermsPage() {
  return <article className="terms-page surface" aria-labelledby="terms-title">
    <header className="terms-header">
      <p className="terms-status">Rascunho educacional</p>
      <h1 id="terms-title">Termos de uso</h1>
      <p>Orientações para o uso do Estoque Revisão. A consulta é informativa e dispensa aceite.</p>
      <dl className="terms-metadata">
        <div><dt>Versão</dt><dd>0.1</dd></div>
        <div><dt>Elaboração</dt><dd>Rafael Silva e João Victor Fernandes</dd></div>
      </dl>
    </header>

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
      <section>
        <h2>Fontes consultadas</h2>
        <ul>
          <li><a href={`${documentation}/REGRAS_NEGOCIO.md`}>Regras de negócio do EstoqueRevisao</a></li>
          <li><a href={`${documentation}/FUNCIONALIDADES.md`}>Funcionalidades implementadas</a></li>
          <li><a href={`${documentation}/ARQUITETURA.md`}>Arquitetura, autenticação e autorização</a></li>
        </ul>
      </section>
    </div>
  </article>;
}
