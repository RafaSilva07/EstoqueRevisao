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
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState<TourId | null>(null);
  const [running, setRunning] = useState(false);
  const [previousPage, setPreviousPage] = useState(page);
  const panelId = useId();
  const titleId = useId();
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const tours = availableHelpTours(user, mode);
  const tour = tours.find(({ id }) => id === selected);
  const atCompletion = tour?.id === 'review-stock' && reviewCompleted;
  const onTourPage = Boolean(tour && (page === tour.page || atCompletion));
  if (previousPage !== page) {
    setPreviousPage(page);
    if (previousPage === tour?.page && !onTourPage) setRunning(false);
  }

  useLayoutEffect(() => {
    if (isOpen) heading.current?.focus({ preventScroll: true });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function dismissOutside(event: PointerEvent) {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setIsOpen(false);
    }
    document.addEventListener('pointerdown', dismissOutside, true);
    return () => document.removeEventListener('pointerdown', dismissOutside, true);
  }, [isOpen]);

  function close() {
    setIsOpen(false);
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
    const dialog = document.querySelector<HTMLElement>('.dialog-backdrop > [role="dialog"]:has(.tour-coach)');
    if (dialog) dialog.focus({ preventScroll: true });
    else close();
  }

  function end() {
    setSelected(null);
    pause();
  }

  return <>
    <div className="help-menu" ref={container} onBlur={(event) => {
      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
    }} onKeyDown={(event) => {
      if (isOpen && event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    }}>
      <button ref={trigger} type="button" className="help-trigger" aria-haspopup="dialog" aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined} onClick={() => isOpen ? close() : setIsOpen(true)}>
        Ajuda <span className="dropdown-chevron" aria-hidden="true" />
      </button>
      {isOpen && <section id={panelId} className="help-panel" role="dialog" aria-labelledby={titleId}>
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
          <button type="button" className="secondary" onClick={() => { close(); if (page !== 'terms') navigate('terms'); }}>Termos de uso</button>
          <button type="button" className="secondary" onClick={close}>Fechar ajuda</button>
        </div>
      </section>}
    </div>
    {tour && onTourPage && <TourCoach key={tour.id} tour={tour} hidden={isOpen} paused={!running} reviewCompleted={atCompletion}
      onPause={pause} onResume={() => setRunning(true)} onEnd={end} />}
  </>;
}
