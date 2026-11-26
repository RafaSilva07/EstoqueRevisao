import { useLayoutEffect, useRef, type FocusEvent, type MouseEvent } from 'react';

const documentation = 'https://github.com/RafaSilva07/EstoqueRevisao/blob/develop/documentos';
const sourceGroups = [{
  title: 'Documentação do sistema',
  links: [
    { url: `${documentation}/REGRAS_NEGOCIO.md`, label: 'Regras de negócio do EstoqueRevisao' },
    { url: `${documentation}/FUNCIONALIDADES.md`, label: 'Funcionalidades implementadas' },
    { url: `${documentation}/ARQUITETURA.md`, label: 'Arquitetura, autenticação e autorização' },
  ],
}, {
  title: 'Referências oficiais',
  links: [
    { url: 'https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm', label: 'Lei Geral de Proteção de Dados Pessoais' },
    { url: 'https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados', label: 'ANPD — direitos dos titulares' },
    { url: 'https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm', label: 'Código de Defesa do Consumidor' },
    { url: 'https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l12965.htm', label: 'Marco Civil da Internet' },
  ],
}];

function revealFocusedControl({ currentTarget }: FocusEvent<HTMLElement>) {
  if (currentTarget.matches(':focus-visible')) currentTarget.scrollIntoView({ block: 'nearest', behavior: 'instant' });
}

function jumpToHeading(event: MouseEvent<HTMLAnchorElement>) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const target = document.getElementById(event.currentTarget.hash.slice(1));
  if (!target) return;
  event.preventDefault();
  target.focus({ preventScroll: true });
  const disclosure = event.currentTarget.closest('details');
  if (disclosure) disclosure.open = false;
  if (target.id === 'terms-title') window.scrollTo({ top: 0, behavior: 'instant' });
  else target.scrollIntoView({ block: 'start', behavior: 'instant' });
}

function TermsIndex({ topics }: { topics: { id: string; title: string }[] }) {
  const links = <ul role="list">
    {[...topics, { id: 'terms-sources', title: 'Fontes consultadas' }].map(({ id, title }) => <li key={id}>
      <a href={`#${id}`} onClick={jumpToHeading} onFocus={revealFocusedControl}>{title}</a>
    </li>)}
  </ul>;

  return <nav className="terms-index" aria-label="Nesta página">
    <details>
      <summary onFocus={revealFocusedControl}>Nesta página</summary>
      {links}
    </details>
    <div className="terms-index-wide">
      <p>Nesta página</p>
      {links}
    </div>
  </nav>;
}

export function TermsPage() {
  const heading = useRef<HTMLHeadingElement>(null);

  const topics = [
    {
      id: 'terms-finalidade',
      title: 'Finalidade e acesso',
      body: <>
        <p>O Estoque Revisão permite cadastrar produtos, consultar lotes e saldos e registrar revisões, envios e recebimentos de estoque. Este documento se destina às pessoas autorizadas a usar o sistema e à equipe que acompanha a atividade educacional.</p>
        <p>O acesso operacional requer uma conta ativa. As funções disponíveis dependem das permissões da conta e do modo operacional. Para dúvidas sobre o uso ou o acesso, procure o responsável pela plataforma.</p>
      </>,
    },
    {
      id: 'terms-conta',
      title: 'Conta, segurança e inativação',
      body: <>
        <p>Use a conta atribuída a você, mantenha sua senha em sigilo e selecione <strong>Sair</strong> ao encerrar o uso, especialmente em dispositivo compartilhado.</p>
        <p>A administração geral pode alterar permissões e inativar contas. A inativação impede o acesso e revoga as sessões da conta. A guarda e o tratamento dos registros associados seguem as regras legais aplicáveis.</p>
      </>,
    },
    {
      id: 'terms-conduta',
      title: 'Conduta no sistema',
      body: <>
        <p>Confira produto, lote, quantidade e destino antes de confirmar uma operação. Registre informações corretas e use os dados de estoque somente para as atividades autorizadas.</p>
        <ul>
          <li>É proibido usar credenciais de terceiros ou tentar contornar controles de acesso.</li>
          <li>É proibido falsificar registros, divulgar informações sem autorização ou interferir no funcionamento da aplicação.</li>
        </ul>
      </>,
    },
    {
      id: 'terms-propriedade',
      title: 'Propriedade intelectual e materiais enviados',
      body: <p>Respeite os direitos sobre o software, a documentação e os materiais de terceiros, conforme as licenças aplicáveis e a legislação. Inclua apenas observações, dados e fotos que você esteja autorizado a usar na operação. Os direitos sobre esses materiais seguem as autorizações concedidas e a legislação aplicável.</p>,
    },
    {
      id: 'terms-planos',
      title: 'Planos, pagamentos e direitos do consumidor',
      body: <p>Contratação de planos, assinaturas e pagamentos estão fora das funções desta versão. Quando houver relação de consumo, aplicam-se os direitos e as garantias do Código de Defesa do Consumidor.</p>,
    },
    {
      id: 'terms-privacidade',
      title: 'Privacidade e registros',
      body: <>
        <p>O sistema usa dados da conta e da sessão para autenticar o acesso. Mantém histórico de movimentações e registros de auditoria. As fotos anexadas aos itens ficam disponíveis às contas autorizadas a consultar o envio. Rascunhos de formulários podem ser guardados no navegador e sincronizados com a conta.</p>
        <p>A LGPD assegura direitos como confirmação do tratamento, acesso e correção dos dados pessoais, além de bloqueio, anonimização ou eliminação nas hipóteses previstas em lei.</p>
      </>,
    },
    {
      id: 'terms-disponibilidade',
      title: 'Disponibilidade e serviços externos',
      body: <p>O funcionamento depende da conexão e de serviços como hospedagem e armazenamento de evidências. Falhas e manutenção podem interromper o acesso. Links externos levam a serviços com condições próprias. Aplicam-se as responsabilidades e garantias previstas em lei.</p>,
    },
    {
      id: 'terms-comunicacoes',
      title: 'Comunicações e alterações',
      body: <p>A tela inicial apresenta avisos operacionais, como pendências de recebimento. A versão no cabeçalho identifica o texto em consulta. Eventuais alterações ficam sujeitas aos requisitos legais de informação, comunicação e consentimento quando aplicáveis.</p>,
    },
    {
      id: 'terms-legislacao',
      title: 'Legislação aplicável e foro',
      body: <p>Aplica-se a legislação brasileira. O foro competente é definido conforme a lei. Quando cabível, o consumidor pode propor ação de responsabilidade civil contra o fornecedor no próprio domicílio.</p>,
    },
  ];

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
      <p className="terms-intro">Condições de uso do Estoque Revisão. A consulta é informativa e dispensa aceite.</p>
      <dl className="terms-metadata">
        <div><dt>Versão</dt><dd>0.2</dd></div>
        <div><dt>Elaboração</dt><dd>Rafael Silva e João Victor Fernandes</dd></div>
      </dl>
    </header>

    <div className="terms-content">
      <TermsIndex topics={topics} />
      <div className="terms-body">
        {topics.map(({ id, title, body }) => <section className="terms-topic" key={id}>
          <h2 id={id} tabIndex={-1}>{title}</h2>
          {body}
        </section>)}
        <section className="terms-sources">
          <h2 id="terms-sources" tabIndex={-1}>Fontes consultadas</h2>
          <p id="terms-source-note">Os links abrem em uma nova aba.</p>
          {sourceGroups.map(({ title, links }) => <div className="terms-source-group" key={title}>
            <h3>{title}</h3>
            <ul role="list">
              {links.map(({ url, label }) => <li key={url}>
                <a href={url} target="_blank" rel="noopener" aria-describedby="terms-source-note" onFocus={revealFocusedControl}>
                  <span>{label}</span><span aria-hidden="true">↗</span>
                </a>
              </li>)}
            </ul>
          </div>)}
        </section>
        <a className="terms-back-top" href="#terms-title" onClick={jumpToHeading} onFocus={revealFocusedControl}>
          <span aria-hidden="true">↑</span> Voltar ao início dos termos
        </a>
      </div>
    </div>
  </article>;
}
