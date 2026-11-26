import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { HelpTour } from './help-tours';
import { resolveTourHint, type TourHint } from './tour-hints';
import { tourPreview } from './tour-preview';

type Placement = {
  hint: TourHint;
  anchor: HTMLElement | null;
  dialog: HTMLElement | null;
  popup: HTMLElement | null;
  previewIndex: number | null;
  editingOther: boolean;
};
type ViewBounds = { left: number; top: number; right: number; bottom: number };
type AnchorSide = 'above' | 'below' | 'left' | 'right';

const resultTargets = ['product-result', 'receipt-result', 'shipment-result'];
const reviewableTargets = ['product-unit', 'receipt-separation', 'separation-amount', 'assembly-mixed', 'shipment-expiry'];
const tabStops = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]';
const anchorGap = 12;

function shown(element: HTMLElement) {
  return element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
}

function topDialog() {
  const dialogs = [...document.querySelectorAll<HTMLElement>('.dialog-backdrop > [role="dialog"]')].filter(shown);
  return dialogs.sort((first, second) => {
    const layer = (element: HTMLElement) => Number(getComputedStyle(element.parentElement!).zIndex) || 0;
    return layer(first) - layer(second);
  }).at(-1) ?? null;
}

function focusable(element: HTMLElement) {
  return element.matches(tabStops) && element.tabIndex >= 0;
}

function anchorBox(anchor: HTMLElement) {
  if (anchor.dataset.tour === 'receipt-separation') return (anchor.closest('fieldset') ?? anchor).getBoundingClientRect();
  if (anchor.matches('input[type="checkbox"], input[type="radio"]')) return (anchor.closest('label') ?? anchor).getBoundingClientRect();
  if (anchor.dataset.tour?.endsWith('-photo')) return (anchor.closest('.row-actions') ?? anchor).getBoundingClientRect();
  return anchor.getBoundingClientRect();
}

function viewport(dialog: HTMLElement | null): ViewBounds {
  const visual = window.visualViewport;
  const left = visual?.offsetLeft ?? 0;
  const top = visual?.offsetTop ?? 0;
  const right = left + (visual?.width ?? document.documentElement.clientWidth);
  let bottom = top + (visual?.height ?? window.innerHeight);
  let ceiling = top;
  if (!dialog) {
    const header = document.querySelector('.topbar')?.getBoundingClientRect();
    const navigation = document.querySelector('.bottom-nav')?.getBoundingClientRect();
    if (header && header.height > 0 && header.top <= top) ceiling = Math.max(top, header.bottom);
    if (navigation && navigation.height > 0 && navigation.bottom >= bottom - 1) bottom = Math.min(bottom, navigation.top);
  }
  return { left: left + 8, top: ceiling + 8, right: right - 8, bottom: bottom - 8 };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function intersection(first: ViewBounds, second: ViewBounds): ViewBounds {
  return {
    left: Math.max(first.left, second.left), top: Math.max(first.top, second.top),
    right: Math.min(first.right, second.right), bottom: Math.min(first.bottom, second.bottom),
  };
}

function visibleBox(rect: ViewBounds, bounds: ViewBounds) {
  const box = intersection(rect, bounds);
  return box.right > box.left && box.bottom > box.top ? box : null;
}

function reveal(anchor: HTMLElement, dialog: HTMLElement | null, area: ViewBounds, bounds: ViewBounds, cardWidth: number, cardHeight: number) {
  const rect = anchor.getBoundingClientRect();
  const center = (area.top + area.bottom) / 2;
  const sideRoom = Math.max(rect.left - bounds.left, bounds.right - rect.right);
  // For a short, narrow viewport, leave room for the actions below the field.
  const latest = Math.max(area.top + rect.height / 2, bounds.bottom - anchorGap - cardHeight - rect.height / 2);
  const target = sideRoom >= cardWidth + anchorGap ? center : Math.min(center, latest);
  const top = rect.top + rect.height / 2 - target;
  if (Math.abs(top) > 1) (dialog ?? window).scrollBy({ top, behavior: 'instant' });
}

function anchoredPosition(box: ViewBounds, obstacles: ViewBounds[], bounds: ViewBounds, width: number, height: number, minHeight: number, preferBelow: boolean) {
  const above = Math.min(...obstacles.map(({ top }) => top)) - anchorGap;
  const below = Math.max(...obstacles.map(({ bottom }) => bottom)) + anchorGap;
  const left = Math.min(...obstacles.map(({ left }) => left)) - anchorGap;
  const right = Math.max(...obstacles.map(({ right }) => right)) + anchorGap;
  const roomBelow = bounds.bottom - below;
  const roomAbove = above - bounds.top;
  const roomOnRight = bounds.right - right;
  const roomOnLeft = left - bounds.left;
  const vertical = (side: 'below' | 'above', room: number) => ({
    left: box.left, top: side === 'below' ? below : above, side, maxHeight: room,
  });
  if (preferBelow && roomBelow >= height) return vertical('below', roomBelow);
  if (roomOnRight >= width) return { left: right, top: box.top, side: 'right' as const, maxHeight: height };
  if (roomOnLeft >= width) return { left: left - width, top: box.top, side: 'left' as const, maxHeight: height };
  if (roomBelow >= height) return vertical('below', roomBelow);
  if (roomAbove >= height) return vertical('above', roomAbove);
  if (Math.max(roomBelow, roomAbove) < minHeight) return null;
  return roomBelow >= roomAbove ? vertical('below', roomBelow) : vertical('above', roomAbove);
}

function samePlacement(previous: Placement | null, next: Placement | null) {
  if (!previous || !next) return previous === next;
  return previous.anchor === next.anchor && previous.dialog === next.dialog && previous.popup === next.popup
    && previous.previewIndex === next.previewIndex && previous.editingOther === next.editingOther
    && previous.hint.target === next.hint.target && previous.hint.title === next.hint.title
    && previous.hint.instruction === next.hint.instruction && previous.hint.canContinue === next.hint.canContinue
    && previous.hint.complete === next.hint.complete;
}

export function TourCoach({ tour, hidden, paused, reviewCompleted, onPause, onResume, onEnd }: {
  tour: HelpTour;
  hidden: boolean;
  paused: boolean;
  reviewCompleted: boolean;
  onPause: () => void;
  onResume: () => void;
  onEnd: () => void;
}) {
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const steps = tourPreview[tour.id];
  const preview = previewIndex === null ? undefined : steps[previewIndex];
  const id = useId();
  const balloon = useRef<HTMLElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const details = useRef<HTMLDivElement>(null);
  const resumeButton = useRef<HTMLButtonElement>(null);
  const initialFocus = useRef(true);
  const focusAfterPause = useRef(false);
  const focusAfterResume = useRef(false);
  const nextButton = useRef<HTMLButtonElement>(null);
  const focusOperation = useRef(false);
  const manual = useRef(new WeakSet<HTMLElement>());
  const refresh = useRef<() => void>(() => undefined);
  const staleResults = useRef<Partial<Record<string, { element: HTMLElement; message: string }>> | null>(null);
  const revealPending = useRef(false);
  const previousHint = useRef<{ title: string; previewIndex: number | null; anchor: HTMLElement | null; panel: HTMLElement; paused: boolean } | null>(null);
  const positionHistory = useRef<{ panel: HTMLElement; left: number; top: number } | null>(null);
  const motion = useRef<Animation | null>(null);

  useEffect(() => {
    const main = document.getElementById('main-content');
    if (!main) return;
    if (!staleResults.current) {
      staleResults.current = {};
      for (const target of resultTargets) {
        const element = main.querySelector<HTMLElement>(`[data-tour="${target}"]`);
        if (element) staleResults.current[target] = { element, message: element.textContent };
      }
    }

    let frame = 0;
    const scan = () => {
      frame = 0;
      const dialog = topDialog();
      const dialogTitle = dialog?.getAttribute('aria-labelledby') ?? null;
      const scope = dialog ?? main;
      const active = document.activeElement;
      function candidates(target: string) {
        return [...scope.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`)].filter(shown);
      }
      function find(target: string) {
        if (target === 'review-result' && reviewCompleted) {
          if (dialogTitle === 'movement-detail-title') return document.getElementById(dialogTitle) ?? undefined;
          if (!dialog) return scope.querySelector<HTMLElement>('.notice-success') ?? scope;
        }
        const elements = candidates(target);
        const element = elements.find((item) => item === active) ?? elements.find((item) => !item.matches(':disabled')) ?? elements[0];
        const stale = staleResults.current?.[target];
        return stale && element === stale.element && element.textContent === stale.message ? undefined : element;
      }
      const guide = preview ?? resolveTourHint(tour.id, {
        find,
        focused: active instanceof HTMLElement ? active.dataset.tour : undefined,
        reviewed: (target) => candidates(target).some((element) => manual.current.has(element)),
        dialog: dialogTitle,
      });
      const memo = guide ?? {
        target: 'status', title: 'Aguarde a tela da operação',
        instruction: 'Quando os controles da operação estiverem disponíveis, o tour volta a acompanhá-los. Use Próximo passo para consultar as etapas agora.',
      };
      const anchor = find(memo.target) ?? preview?.related?.map(find).find(Boolean) ?? (memo.target === 'status' && dialog
        ? document.getElementById(dialog.getAttribute('aria-labelledby') ?? '') : null);
      const editingOther = active instanceof HTMLElement && active !== anchor && active.matches('input, textarea, select, [role="combobox"]');
      const popup = anchor?.getAttribute('aria-expanded') === 'true' ? document.getElementById(anchor.getAttribute('aria-controls') ?? '') : null;
      const next = { hint: memo, anchor: anchor ?? null, dialog, popup, previewIndex, editingOther };
      setPlacement((previous) => samePlacement(previous, next) ? previous : next);
    };
    function schedule() { if (!frame) frame = requestAnimationFrame(scan); }
    function markAction(event: Event) {
      if (event.target instanceof HTMLElement && event.target.dataset.tour && reviewableTargets.includes(event.target.dataset.tour)
        && (!['separation-amount', 'shipment-expiry'].includes(event.target.dataset.tour) || event.type === 'change')) {
        manual.current.add(event.target);
      }
      schedule();
    }
    refresh.current = schedule;
    const observer = new MutationObserver(schedule);
    observer.observe(document.getElementById('root') ?? main.parentElement ?? main, {
      subtree: true, childList: true, characterData: true, attributes: true,
      attributeFilter: ['data-tour', 'data-tour-ready', 'data-tour-choice', 'data-tour-options', 'disabled', 'aria-invalid', 'aria-expanded', 'aria-pressed', 'hidden'],
    });
    document.addEventListener('input', schedule, true);
    document.addEventListener('focusin', schedule, true);
    document.addEventListener('focusout', schedule, true);
    document.addEventListener('change', markAction, true);
    document.addEventListener('click', markAction, true);
    window.addEventListener('resize', schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      refresh.current = () => undefined;
      document.removeEventListener('input', schedule, true);
      document.removeEventListener('focusin', schedule, true);
      document.removeEventListener('focusout', schedule, true);
      document.removeEventListener('change', markAction, true);
      document.removeEventListener('click', markAction, true);
      window.removeEventListener('resize', schedule);
    };
  }, [preview, previewIndex, reviewCompleted, tour.id]);

  useLayoutEffect(() => {
    const panel = balloon.current;
    const content = card.current;
    if (!placement || hidden || !panel || !content) return;
    const { anchor, dialog, popup } = placement;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const highlight = paused || placement.hint.complete ? null : anchor;
    if (highlight) {
      highlight.setAttribute('data-tour-highlight', '');
      const descriptions = highlight.getAttribute('aria-describedby')?.split(/\s+/).filter(Boolean) ?? [];
      highlight.setAttribute('aria-describedby', [...descriptions, id].join(' '));
    }

    let frame = 0;
    function onMotionChange() {
      if (reducedMotion.matches) motion.current?.cancel();
    }

    function position(transition = false, centerAnchor = false) {
      frame = 0;
      if (!panel || !content) return;
      const bounds = viewport(dialog);
      const width = Math.min(352, bounds.right - bounds.left);
      const availableHeight = Math.min(320, bounds.bottom - bounds.top);
      if (width <= 0 || availableHeight <= 0) { panel.style.visibility = 'hidden'; return; }

      panel.style.width = `${width}px`;
      panel.toggleAttribute('data-compact', bounds.bottom - bounds.top < 480);
      const detail = details.current;
      const chromeHeight = content.scrollHeight - (detail?.offsetHeight ?? 0) + content.offsetHeight - content.clientHeight;
      const desiredHeight = Math.min(availableHeight, chromeHeight + (detail?.scrollHeight ?? 0));
      const usableHeight = Math.min(desiredHeight, chromeHeight + 64);
      const area = dialog ? intersection(bounds, dialog.getBoundingClientRect()) : bounds;
      if (highlight && centerAnchor) reveal(highlight, dialog, area, bounds, width, usableHeight);
      const anchorRect = highlight?.getBoundingClientRect();
      const visibleAnchor = anchorRect && visibleBox(anchorRect, area);
      const rect = highlight && visibleAnchor ? visibleBox(anchorBox(highlight), area) ?? visibleAnchor : null;
      const active = document.activeElement;
      const focused = placement?.editingOther && active instanceof HTMLElement && (!dialog || dialog.contains(active))
        ? visibleBox(active.getBoundingClientRect(), area) : null;
      const popupRect = rect && popup && visibleBox(popup.getBoundingClientRect(), area);
      const previous = positionHistory.current;
      let left = previous?.left ?? bounds.right - width;
      let top = previous?.top ?? bounds.bottom;
      let maxHeight = availableHeight;
      let side: AnchorSide | undefined;
      let alignEnd = !previous;
      const box = rect ?? focused;
      if (box) {
        const avoid = [box, ...(popupRect ? [popupRect] : []), ...(rect && focused ? [focused] : [])];
        const preferBelow = Boolean(highlight?.matches('input, select, textarea'));
        const best = anchoredPosition(box, avoid, bounds, width, desiredHeight, usableHeight, preferBelow)
          ?? anchoredPosition(box, [box], bounds, width, desiredHeight, 1, preferBelow);
        if (best) {
          ({ left, top, side } = best);
          maxHeight = Math.min(availableHeight, Math.max(Math.min(desiredHeight, chromeHeight + 24), best.maxHeight));
          alignEnd = side === 'above';
        } else {
          left = box.left;
          alignEnd = (box.top + box.bottom) / 2 < (bounds.top + bounds.bottom) / 2;
          top = alignEnd ? bounds.bottom : bounds.top;
        }
      } else if (anchorRect) {
        // Manual scrolling can move the control out of view. Keep the actions near that edge.
        left = anchorRect.left;
        alignEnd = anchorRect.bottom > area.top;
        top = alignEnd ? bounds.bottom : bounds.top;
      }

      panel.style.maxHeight = `${maxHeight}px`;
      const height = panel.offsetHeight;
      left = clamp(left, bounds.left, bounds.right - width);
      top = clamp(alignEnd ? top - height : top, bounds.top, bounds.bottom - height);
      if (rect && side && !popupRect && !focused && !visibleBox(rect, { left, top, right: left + width, bottom: top + height })) {
        const horizontal = side === 'above' || side === 'below';
        const offset = horizontal
          ? clamp((rect.left + rect.right) / 2 - left, 16, width - 16)
          : clamp((rect.top + rect.bottom) / 2 - top, 16, height - 16);
        panel.dataset.anchorSide = side;
        panel.style.setProperty('--tour-pointer', `${offset}px`);
      } else {
        delete panel.dataset.anchorSide;
      }

      const moved = previous?.panel !== panel || previous.left !== left || previous.top !== top;
      const origin = previous?.panel === panel && motion.current?.playState === 'running'
        ? panel.getBoundingClientRect() : previous;
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      panel.style.visibility = 'visible';
      positionHistory.current = { panel, left, top };
      if (moved || transition) {
        motion.current?.cancel();
        if (transition && !reducedMotion.matches && typeof panel.animate === 'function') {
          const startLeft = clamp(origin?.left ?? left, bounds.left, bounds.right - width);
          const startTop = clamp(origin?.top ?? top + 6, bounds.top, bounds.bottom - height);
          const offset = `translate(${startLeft - left}px, ${startTop - top}px)`;
          motion.current = panel.animate([{ transform: offset, opacity: origin ? 0.92 : 0 }, { transform: 'none', opacity: 1 }], {
            duration: 240, easing: 'cubic-bezier(.2,.75,.25,1)',
          });
        }
      }
    }

    function schedule() { if (!frame) frame = requestAnimationFrame(() => position()); }
    const previous = previousHint.current;
    const stepChanged = previous?.panel !== panel || previous?.anchor !== anchor || previous?.title !== placement.hint.title
      || previous?.previewIndex !== placement.previewIndex || previous.paused !== paused;
    if (stepChanged) revealPending.current = Boolean(highlight);
    const follow = focusOperation.current && placement.previewIndex === null && !paused;
    if (follow) {
      focusOperation.current = false;
      if (anchor && focusable(anchor)) {
        anchor.focus({ preventScroll: true });
      }
    }
    if (stepChanged && details.current) details.current.scrollTop = 0;
    const shouldReveal = follow || (revealPending.current && !placement.editingOther);
    if (shouldReveal) revealPending.current = false;
    position(stepChanged, shouldReveal);
    if (initialFocus.current && !paused && panel.style.visibility === 'visible') {
      initialFocus.current = false;
      const current = document.activeElement;
      if (current?.matches('.help-trigger, #main-content') || current === dialog) {
        details.current?.focus({ preventScroll: true });
      }
    }
    if (paused && focusAfterPause.current) {
      focusAfterPause.current = false;
      resumeButton.current?.focus({ preventScroll: true });
    }
    if (!paused && focusAfterResume.current) {
      focusAfterResume.current = false;
      nextButton.current?.focus({ preventScroll: true });
    }
    previousHint.current = { panel, anchor, title: placement.hint.title, previewIndex: placement.previewIndex, paused };
    const resize = new ResizeObserver(schedule);
    if (anchor) resize.observe(anchor);
    resize.observe(panel);
    resize.observe(dialog ?? document.getElementById('main-content') ?? document.body);
    if (popup) resize.observe(popup);
    document.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    reducedMotion.addEventListener('change', onMotionChange);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      document.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
      reducedMotion.removeEventListener('change', onMotionChange);
      if (highlight) {
        highlight.removeAttribute('data-tour-highlight');
        const remaining = highlight.getAttribute('aria-describedby')?.split(/\s+/).filter((part) => part && part !== id);
        if (remaining?.length) highlight.setAttribute('aria-describedby', remaining.join(' '));
        else highlight.removeAttribute('aria-describedby');
      }
    };
  }, [hidden, id, paused, placement]);

  if (!placement || hidden) return null;
  const { anchor, dialog, hint, previewIndex: displayedStep } = placement;
  function wrapTab(event: React.KeyboardEvent<HTMLElement>) {
    // Portal events reach HelpMenu, so wrap the physical modal's tab order here.
    if (event.key !== 'Tab' || event.shiftKey || !dialog
      || event.target !== [...event.currentTarget.querySelectorAll('button:not(:disabled)')].at(-1)) return;
    const first = [...dialog.querySelectorAll<HTMLElement>(tabStops)].find((element) => focusable(element) && shown(element));
    if (first) { event.preventDefault(); first.focus(); }
  }

  function advance() {
    if (displayedStep === steps.length - 1) { onEnd(); return; }
    nextButton.current?.focus({ preventScroll: true });
    if (displayedStep !== null) { setPreviewIndex(displayedStep + 1); return; }
    if (hint.complete) { onEnd(); return; }
    const current = steps.findIndex((step) => step.target === hint.target || step.related?.includes(hint.target));
    setPreviewIndex(Math.min(current + 1, steps.length - 1));
  }

  function pause() {
    focusAfterPause.current = Boolean(dialog);
    onPause();
  }

  const complete = displayedStep === null ? hint.complete : displayedStep === steps.length - 1;
  const stepIndex = displayedStep ?? steps.findIndex((step) => step.target === hint.target || step.related?.includes(hint.target));
  const mode = displayedStep === null ? 'Modo guiado' : 'Prévia';
  const stage = stepIndex >= 0 ? `${mode} · Etapa ${stepIndex + 1} de ${steps.length}` : mode;
  if (paused && !dialog) return null;

  return createPortal(
    <aside ref={balloon} className="tour-coach" aria-label={tour.title} onKeyDown={(event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (!paused) pause();
      }
      wrapTab(event);
    }}>
      <div ref={card} className="tour-coach-card">
        <header>
          <div>
            <p className="tour-coach-label">{tour.title}</p>
            <p className="tour-coach-stage" aria-hidden={!paused}>{paused ? 'Tour pausado' : stage}</p>
          </div>
          <button type="button" className="secondary tour-coach-close" aria-label="Fechar tour" onClick={onEnd}>
            <span aria-hidden="true">×</span>
          </button>
        </header>
        {paused ? <footer className="tour-coach-actions">
          <button ref={resumeButton} type="button" onClick={() => {
            focusAfterResume.current = true;
            onResume();
          }}>Retomar tour</button>
        </footer> : <>
          <div ref={details} className="tour-coach-details" tabIndex={0} aria-label="Instruções do tour">
            <div role="status" aria-atomic="true">
              <span className="tour-coach-announcement">{stage}</span>
              {stepIndex >= 0 && <div className="tour-coach-progress" aria-hidden="true">
                {steps.map((step, index) => <span key={step.target} data-reached={index < stepIndex} data-current={index === stepIndex} />)}
              </div>}
              <h2>{hint.title}</h2>
              <p id={id} className="tour-coach-instruction">{hint.instruction}</p>
              {displayedStep !== null && !anchor && <p className="tour-coach-context">Controle indisponível nesta tela</p>}
            </div>
          </div>
          <footer className="tour-coach-actions" data-preview={displayedStep !== null}>
            {displayedStep !== null && <button type="button" className="secondary tour-coach-follow" onClick={() => {
              nextButton.current?.focus({ preventScroll: true });
              focusOperation.current = true;
              setPreviewIndex(null);
            }}>Acompanhar operação</button>}
            {displayedStep !== null && <button type="button" className="secondary" aria-disabled={displayedStep === 0} onClick={() => {
              if (displayedStep > 0) setPreviewIndex(displayedStep - 1);
            }}>Passo anterior</button>}
            {displayedStep === null && hint.canContinue && anchor && <button type="button" className="secondary" onClick={() => {
              manual.current.add(anchor);
              nextButton.current?.focus({ preventScroll: true });
              refresh.current();
            }}>Já conferi</button>}
            {displayedStep === null && !hint.complete && <button type="button" className="secondary" onClick={pause}>Pausar tour</button>}
            <button ref={nextButton} type="button" onClick={advance}>
              {complete ? 'Concluir tour' : 'Próximo passo'}
              <span className="tour-coach-next-icon" aria-hidden="true" data-complete={Boolean(complete)} />
            </button>
          </footer>
        </>}
      </div>
    </aside>,
    dialog ?? document.body,
  );
}
