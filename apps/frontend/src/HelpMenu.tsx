import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { UserSession } from './api';
import { availableHelpTours, type HelpTour, type TourId } from './help-tours';
import type { Page } from './navigation-model';
import { type OperationalMode, operationalModeLabel } from './operational-mode';
import { TourCoach } from './TourCoach';

export function HelpMenu({ user, mode, page, navigate, reviewCompleted = false }: {
  user: UserSession;
  mode: OperationalMode;
  page: Page;
  navigate: (page: Page) => void;
  reviewCompleted?: boolean;
}) {
  const [view, setView] = useState<'menu' | 'terms' | null>(null);
  const [selected, setSelected] = useState<TourId | null>(null);
  const [running, setRunning] = useState(false);
  const [previousPage, setPreviousPage] = useState(page);
  const panelId = useId();
  const titleId = useId();
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const isOpen = view !== null;
  const tours = availableHelpTours(user, mode);
  const tour = tours.find(({ id }) => id === selected);
  const atCompletion = tour?.id === 'review-stock' && reviewCompleted;
  const onTourPage = Boolean(tour && (page === tour.page || atCompletion));
  if (previousPage !== page) {
    setPreviousPage(page);
    if (previousPage === tour?.page && !onTourPage) setRunning(false);
  }

  useLayoutEffect(() => {
    if (!view) return;
    if (panel.current) panel.current.scrollTop = 0;
    heading.current?.focus({ preventScroll: true });
  }, [view]);

  useEffect(() => {
    if (!isOpen) return;
    function dismissOutside(event: PointerEvent) {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setView(null);
    }
    document.addEventListener('pointerdown', dismissOutside, true);
    return () => document.removeEventListener('pointerdown', dismissOutside, true);
  }, [isOpen]);

  function close() {
    setView(null);
    trigger.current?.focus({ preventScroll: true });
  }

  function start(next: HelpTour) {
    setSelected(next.id);
    setRunning(true);
    close();
    if (page !== next.page) navigate(next.page);
  }

  function pause() {
    setRunning(false);
    const dialog = document.querySelector<HTMLElement>('.dialog-backdrop > [role="dialog"]:has(.tour-coach, .tour-resume)');
    if (dialog) dialog.focus({ preventScroll: true });
    else close();
  }

  function end() {
    setSelected(null);
    pause();
  }

  return <>
    <div className="help-menu" ref={container} onBlur={(event) => {
      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setView(null);
    }} onKeyDown={(event) => {
      if (isOpen && event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    }}>
      <button ref={trigger} type="button" className="help-trigger" aria-haspopup="dialog" aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined} onClick={() => isOpen ? close() : setView('menu')}>
        Ajuda <span className="dropdown-chevron" aria-hidden="true" />
      </button>
      {view && <section ref={panel} id={panelId} className="help-panel" role="dialog" aria-labelledby={titleId}>
        {view === 'terms' ? <>
          <h2 ref={heading} id={titleId} tabIndex={-1}>Termos de uso</h2>
          <EducationalTerms />
          <div className="help-actions">
            <button type="button" className="secondary" onClick={() => setView('menu')}>Voltar à ajuda</button>
            <button type="button" onClick={close}>Fechar ajuda</button>
          </div>
        </> : <>
          <h2 ref={heading} id={titleId} tabIndex={-1}>Ajuda</h2>
          <h3>Tours de {operationalModeLabel[mode]}</h3>
          {tours.length ? <ul className="help-tours">{tours.map((item) => <li key={item.id}>
            <button type="button" className="secondary" onClick={() => start(item)}>{item.title}</button>
          </li>)}</ul> : <p>{mode === 'ADMIN' ? 'Selecione Revisão ou Expedição em Modo operacional para consultar os tours disponíveis para a sua conta.' : 'Não há tours disponíveis para este modo e as permissões da sua conta.'}</p>}
          {tour && <div className="help-actions">
            {running && onTourPage
              ? <button type="button" className="secondary" onClick={() => { setRunning(false); heading.current?.focus(); }}>Pausar tour</button>
              : <button type="button" onClick={() => start(tour)}>Continuar tour de {tour.title.toLocaleLowerCase('pt-BR')}</button>}
            <button type="button" className="secondary" onClick={end}>Fechar tour</button>
          </div>}
          <div className="help-actions">
            <button type="button" className="secondary" onClick={() => setView('terms')}>Termos de uso</button>
            <button type="button" className="secondary" onClick={close}>Fechar ajuda</button>
          </div>
        </>}
      </section>}
    </div>
    {tour && onTourPage && <TourCoach key={tour.id} tour={tour} hidden={isOpen} paused={!running} reviewCompleted={atCompletion}
      onPause={pause} onResume={() => setRunning(true)} onEnd={end} />}
  </>;
}

const repository = 'https://github.com/RafaSilva07/EstoqueRevisao/blob/develop';

function EducationalTerms() {
  return <div className="help-terms">
    <p><strong>Rascunho educacional · versão 0.1</strong></p>
    <p><strong>Elaboração:</strong> Rafael Silva e João Victor Fernandes</p>
    <p>Material elaborado para a atividade educacional e sujeito a revisão. A consulta é informativa e dispensa aceite.</p>

    <h3>Público-alvo e finalidade</h3>
    <p>Destinado às pessoas que usam o Estoque Revisão e à equipe que acompanha a atividade educacional. Apresenta a finalidade do sistema e orienta a leitura de suas funcionalidades. O sistema registra produtos, lotes, saldos e movimentações conforme as permissões da conta.</p>

    <h3>Uso da conta e registros</h3>
    <p>Use a conta que lhe foi atribuída e confira os dados antes de confirmar operações. O sistema mantém histórico de movimentações e auditoria. As fotos exigidas nos fluxos de envio são vinculadas aos itens e ficam disponíveis a contas autorizadas a consultar o envio.</p>

    <h3>Responsável pela revisão</h3>
    <p>A equipe mantenedora do EstoqueRevisao é a responsável proposta pela revisão deste rascunho. A designação e o contato oficial estão pendentes de confirmação.</p>

    <h3>Fontes consultadas</h3>
    <ul>
      <li><a href={`${repository}/documentos/REGRAS_NEGOCIO.md`}>Regras de negócio do EstoqueRevisao</a></li>
      <li><a href={`${repository}/documentos/FUNCIONALIDADES.md`}>Funcionalidades implementadas</a></li>
      <li><a href={`${repository}/documentos/ARQUITETURA.md`}>Arquitetura, autenticação e autorização</a></li>
    </ul>

    <h3>Dúvidas pendentes</h3>
    <ul>
      <li>Quem aprova a versão final e responde pelas atualizações?</li>
      <li>Qual canal oficial recebe dúvidas sobre acesso, correções e dados?</li>
      <li>Quais regras aprovadas se aplicam à retenção e à eliminação de registros, logs e fotos?</li>
      <li>Que dados podem ser usados em demonstrações e exercícios?</li>
    </ul>
  </div>;
}
