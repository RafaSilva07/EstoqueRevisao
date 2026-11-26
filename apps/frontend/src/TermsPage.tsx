import { useLayoutEffect, useRef } from 'react';

const documentation = 'https://github.com/RafaSilva07/EstoqueRevisao/blob/develop/documentos';
const sources = [
  { url: `${documentation}/REGRAS_NEGOCIO.md`, label: 'Regras de negócio do EstoqueRevisao' },
  { url: `${documentation}/FUNCIONALIDADES.md`, label: 'Funcionalidades implementadas' },
  { url: `${documentation}/ARQUITETURA.md`, label: 'Arquitetura, autenticação e autorização' },
  { url: 'https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm', label: 'Lei Geral de Proteção de Dados Pessoais' },
  { url: 'https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados', label: 'ANPD — direitos dos titulares' },
  { url: 'https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm', label: 'Código de Defesa do Consumidor' },
  { url: 'https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l12965.htm', label: 'Marco Civil da Internet' },
];

function configuredPrivacyPolicy(): string | undefined {
  const value: unknown = import.meta.env.VITE_PRIVACY_POLICY_URL;
  const configuredUrl = typeof value === 'string' ? value.trim() : '';
  if (!configuredUrl) return;
  try {
    const url = new URL(configuredUrl);
    if (url.protocol === 'https:' && !url.username && !url.password) return url.href;
  } catch {
    // A configuração inválida não deve aparecer como um link de política.
  }
}

export function TermsPage() {
  const heading = useRef<HTMLHeadingElement>(null);
  const privacyPolicy = configuredPrivacyPolicy();

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
      <p className="terms-intro">Condições de uso do sistema Estoque Revisão. A consulta a este rascunho é informativa e dispensa aceite.</p>
      <dl className="terms-metadata">
        <div><dt>Versão</dt><dd>0.2</dd></div>
        <div><dt>Elaboração</dt><dd>Rafael Silva e João Victor Fernandes</dd></div>
      </dl>
    </header>

    <div className="terms-content">
      <div className="terms-body">
        <section>
          <h2>Finalidade e acesso</h2>
          <p>O Estoque Revisão permite cadastrar produtos, consultar lotes e saldos e registrar revisões, envios e recebimentos de estoque. Este documento se destina às pessoas autorizadas a usar o sistema e à equipe que acompanha a atividade educacional. O acesso operacional requer uma conta ativa. As funções disponíveis dependem das permissões da conta e do modo operacional.</p>
        </section>
        <section>
          <h2>Conta, segurança e inativação</h2>
          <p>Use a conta atribuída a você, mantenha sua senha em sigilo e selecione <strong>Sair</strong> ao encerrar o uso, especialmente em dispositivo compartilhado.</p>
          <p>A administração geral pode alterar permissões e inativar contas. A inativação impede o acesso e revoga as sessões da conta. A guarda e o tratamento dos registros associados seguem as regras legais aplicáveis.</p>
        </section>
        <section>
          <h2>Conduta no sistema</h2>
          <p>Confira produto, lote, quantidade e destino antes de confirmar uma operação. Registre informações corretas e use os dados de estoque somente para as atividades autorizadas.</p>
          <ul>
            <li>É proibido usar credenciais de terceiros ou tentar contornar controles de acesso.</li>
            <li>É proibido falsificar registros, divulgar informações sem autorização ou interferir no funcionamento da aplicação.</li>
          </ul>
        </section>
        <section>
          <h2>Propriedade intelectual e materiais enviados</h2>
          <p>Respeite os direitos sobre o software, a documentação e os materiais de terceiros, conforme as licenças aplicáveis e a legislação. Inclua apenas observações, dados e fotos que você esteja autorizado a usar na operação. Os direitos sobre esses materiais seguem as autorizações concedidas e a legislação aplicável.</p>
        </section>
        <section>
          <h2>Planos, pagamentos e direitos do consumidor</h2>
          <p>Contratação de planos, assinaturas e pagamentos estão fora das funções desta versão. Quando houver relação de consumo, aplicam-se os direitos e as garantias do Código de Defesa do Consumidor.</p>
        </section>
        <section>
          <h2>Privacidade e registros</h2>
          <p>O sistema usa dados da conta e da sessão para autenticar o acesso. Mantém histórico de movimentações e registros de auditoria. As fotos anexadas aos itens ficam disponíveis às contas autorizadas a consultar o envio. Rascunhos de formulários podem ser guardados no navegador e sincronizados com a conta.</p>
          <p>A LGPD assegura direitos como confirmação do tratamento, acesso e correção dos dados pessoais, além de bloqueio, anonimização ou eliminação nas hipóteses previstas em lei.</p>
          {privacyPolicy && <p><a href={privacyPolicy}>Política de privacidade do Estoque Revisão</a></p>}
        </section>
        <section>
          <h2>Disponibilidade e serviços externos</h2>
          <p>O funcionamento depende da conexão e de serviços como hospedagem e armazenamento de evidências. Falhas e manutenção podem interromper o acesso. Links externos levam a serviços com condições próprias. Aplicam-se as responsabilidades e garantias previstas em lei.</p>
        </section>
        <section>
          <h2>Comunicações e alterações</h2>
          <p>A tela inicial apresenta avisos operacionais, como pendências de recebimento. A versão no cabeçalho identifica o texto em consulta. Eventuais alterações ficam sujeitas aos requisitos legais de informação, comunicação e consentimento quando aplicáveis.</p>
        </section>
        <section>
          <h2>Legislação aplicável e foro</h2>
          <p>Aplica-se a legislação brasileira. O foro competente é definido conforme a lei. Quando cabível, o consumidor pode propor ação de responsabilidade civil contra o fornecedor no próprio domicílio.</p>
        </section>
      </div>
      <section className="terms-sources">
        <h2>Fontes consultadas</h2>
        <p id="terms-source-note">Os links abrem em uma nova aba.</p>
        <ul role="list">
          {sources.map(({ url, label }) => <li key={url}>
            <a href={url} target="_blank" rel="noopener" aria-describedby="terms-source-note"
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
