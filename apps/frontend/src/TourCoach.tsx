import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { HelpTour } from './help-tours';
import { resolveTourHint, type TourHint } from './tour-hints';

type Placement = {
  hint: TourHint;
  anchor: HTMLElement | null;
  dialog: HTMLElement | null;
  popup: HTMLElement | null;
  fieldReady: boolean;
  editingOther: boolean;
};
type ViewBounds = { left: number; top: number; right: number; bottom: number };

const resultTargets = ['product-result', 'receipt-result', 'shipment-result'];
const reviewableTargets = ['product-unit', 'receipt-separation', 'separation-amount', 'assembly-mixed', 'shipment-expiry'];
const tabStops = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]';

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

function fits(rect: DOMRect, bounds: ViewBounds) {
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  return centerY > bounds.top && centerY < bounds.bottom && centerX > bounds.left && centerX < bounds.right;
}

function anchorVisible(anchor: HTMLElement, dialog: HTMLElement | null, bounds: ViewBounds) {
  const rect = anchor.getBoundingClientRect();
  if (!fits(rect, bounds)) return false;
  const clipping = dialog?.getBoundingClientRect();
  return !clipping || fits(rect, clipping);
}

function reveal(anchor: HTMLElement, moveFocus = false) {
  if (moveFocus && focusable(anchor)) anchor.focus({ preventScroll: true });
  anchor.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
}

function samePlacement(previous: Placement | null, next: Placement | null) {
  if (!previous || !next) return previous === next;
  return previous.anchor === next.anchor && previous.dialog === next.dialog && previous.popup === next.popup
    && previous.fieldReady === next.fieldReady && previous.editingOther === next.editingOther
    && previous.hint.target === next.hint.target && previous.hint.title === next.hint.title
    && previous.hint.instruction === next.hint.instruction && previous.hint.canContinue === next.hint.canContinue
    && previous.hint.complete === next.hint.complete;
}

export function TourCoach({ tour, hidden, paused, reviewCompleted, onPause, onResume, onComplete }: {
  tour: HelpTour;
  hidden: boolean;
  paused: boolean;
  reviewCompleted: boolean;
  onPause: () => void;
  onResume: () => void;
  onComplete: () => void;
}) {
  const [placement, setPlacement] = useState<Placement | null>(null);
  const id = useId();
  const balloon = useRef<HTMLElement>(null);
  const manual = useRef(new WeakSet<HTMLElement>());
  const refresh = useRef<() => void>(() => undefined);
  const staleResults = useRef<Partial<Record<string, { element: HTMLElement; message: string }>> | null>(null);
  const lastRevealed = useRef<HTMLElement | null>(null);
  const previousHint = useRef<{ title: string; anchor: HTMLElement | null; panel: HTMLElement } | null>(null);
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
      const guide = resolveTourHint(tour.id, {
        find,
        focused: active instanceof HTMLElement ? active.dataset.tour : undefined,
        reviewed: (target) => candidates(target).some((element) => manual.current.has(element)),
        dialog: dialogTitle,
      });
      const memo = guide ?? (!dialog ? {
        target: 'status', title: 'Aguarde a tela da operação',
        instruction: 'Os controles aparecem após o carregamento. Se houver erro ou se a tela estiver indisponível, pause o tour e verifique a operação.',
      } : undefined);
      const anchor = memo && (find(memo.target) ?? (memo.target === 'status' && dialog
        ? document.getElementById(dialog.getAttribute('aria-labelledby') ?? '') : null));
      const fieldReady = anchor === active && (anchor instanceof HTMLInputElement || anchor instanceof HTMLTextAreaElement)
        && !anchor.matches('[role="combobox"], [type="checkbox"], [type="radio"], [type="search"]')
        && Boolean(anchor.value.trim()) && anchor.validity.valid && anchor.getAttribute('aria-invalid') !== 'true';
      const editingOther = active instanceof HTMLElement && active !== anchor && active.matches('input, textarea, select, [role="combobox"]');
      const popup = anchor?.getAttribute('aria-expanded') === 'true' ? document.getElementById(anchor.getAttribute('aria-controls') ?? '') : null;
      const next = memo ? { hint: memo, anchor: anchor ?? null, dialog, popup, fieldReady, editingOther } : null;
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
  }, [reviewCompleted, tour.id]);

  useLayoutEffect(() => {
    const panel = balloon.current;
    if (!placement || hidden || paused || !panel) return;
    const { anchor, dialog, popup } = placement;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const highlight = anchor && !placement.hint.complete;
    if (highlight) {
      anchor.setAttribute('data-tour-highlight', '');
      const descriptions = anchor.getAttribute('aria-describedby')?.split(/\s+/).filter(Boolean) ?? [];
      anchor.setAttribute('aria-describedby', [...descriptions, id].join(' '));
    }

    let frame = 0;
    function stopMotion() {
      motion.current?.cancel();
      if (panel) panel.style.pointerEvents = '';
    }

    function onMotionChange() {
      if (reducedMotion.matches) stopMotion();
    }

    function position(transition = false) {
      frame = 0;
      if (!panel) return;
      const bounds = viewport(dialog);
      const width = Math.min(320, bounds.right - bounds.left);
      if (width <= 0 || bounds.bottom - bounds.top < 40) { panel.style.visibility = 'hidden'; return; }

      panel.style.width = `${width}px`;
      const visible = Boolean(anchor && anchorVisible(anchor, dialog, bounds));
      const rect = visible && anchor ? anchorBox(anchor) : null;
      const gap = 8;
      let left = bounds.right - width;
      let top = bounds.bottom;
      let maxHeight = Math.min(250, bounds.bottom - bounds.top);
      let alignEnd = true;
      if (rect) {
        const rightSpace = bounds.right - rect.right - gap;
        const leftSpace = rect.left - bounds.left - gap;
        const popupRect = popup?.getBoundingClientRect();
        if (!popupRect && Math.max(rightSpace, leftSpace) >= width) {
          left = rightSpace >= width ? rect.right + gap : rect.left - width - gap;
          top = Math.min(Math.max(bounds.top, rect.top), bounds.bottom - maxHeight);
          alignEnd = false;
        } else {
          const above = Math.min(rect.top, popupRect?.top ?? rect.top) - bounds.top - gap;
          const below = bounds.bottom - Math.max(rect.bottom, popupRect?.bottom ?? rect.bottom) - gap;
          const preferBelow = below >= Math.min(178, maxHeight) || below >= above;
          left = Math.max(bounds.left, Math.min(rect.left, bounds.right - width));
          maxHeight = Math.max(0, Math.min(maxHeight, preferBelow ? below : above));
          top = preferBelow ? Math.max(rect.bottom, popupRect?.bottom ?? rect.bottom) + gap : Math.min(rect.top, popupRect?.top ?? rect.top) - gap;
          alignEnd = !preferBelow;
        }
      }
      panel.style.visibility = maxHeight >= 48 ? 'visible' : 'hidden';
      panel.style.maxHeight = `${maxHeight}px`;
      const height = panel.getBoundingClientRect().height;
      top = Math.max(bounds.top, Math.min(alignEnd ? top - height : top, bounds.bottom - height));
      const previous = positionHistory.current;
      const moved = !previous || previous.panel !== panel || previous.left !== left || previous.top !== top;
      const origin = previous?.panel === panel && motion.current?.playState === 'running'
        ? panel.getBoundingClientRect() : previous;
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      positionHistory.current = { panel, left, top };
      if (moved || transition) {
        stopMotion();
        if (transition && maxHeight >= 48 && !reducedMotion.matches && typeof panel.animate === 'function') {
          const offset = origin ? `translate(${origin.left - left}px, ${origin.top - top}px)` : 'translateY(5px)';
          const animation = panel.animate([{ transform: offset, opacity: origin ? 0.88 : 0 }, { transform: 'none', opacity: 1 }], {
            duration: 230, easing: 'cubic-bezier(.2,.75,.25,1)',
          });
          motion.current = animation;
          if (moved) panel.style.pointerEvents = 'none';
          animation.onfinish = () => { panel.style.pointerEvents = ''; };
        }
      }
    }

    function schedule() { if (!frame) frame = requestAnimationFrame(() => position()); }
    if (anchor && anchor !== lastRevealed.current && !placement.editingOther) {
      if (!anchorVisible(anchor, dialog, viewport(dialog))) reveal(anchor);
      lastRevealed.current = anchor;
    }
    const previous = previousHint.current;
    position(previous?.panel !== panel || previous?.anchor !== anchor || previous?.title !== placement.hint.title);
    previousHint.current = { panel, anchor, title: placement.hint.title };
    const resize = new ResizeObserver(schedule);
    if (anchor) resize.observe(anchor);
    resize.observe(panel);
    if (dialog) resize.observe(dialog);
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
        anchor.removeAttribute('data-tour-highlight');
        const remaining = anchor.getAttribute('aria-describedby')?.split(/\s+/).filter((part) => part && part !== id);
        if (remaining?.length) anchor.setAttribute('aria-describedby', remaining.join(' '));
        else anchor.removeAttribute('aria-describedby');
      }
    };
  }, [hidden, id, paused, placement]);

  if (!placement || hidden) return null;
  const { anchor, dialog, hint, fieldReady } = placement;
  if (paused) return dialog ? createPortal(<div className="tour-resume"><button type="button" className="secondary"
    onKeyDown={(event) => {
      if (event.key !== 'Tab' || event.shiftKey) return;
      const first = [...dialog.querySelectorAll<HTMLElement>(tabStops)].find((element) => focusable(element) && shown(element));
      if (first) { event.preventDefault(); first.focus(); }
    }} onClick={() => { dialog.focus({ preventScroll: true }); onResume(); }}>Retomar tour</button></div>, dialog) : null;
  return createPortal(
    <aside ref={balloon} className="tour-coach" aria-label={tour.title} onKeyDown={(event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onPause();
      }
      if (event.key === 'Tab' && !event.shiftKey && dialog && event.target === event.currentTarget.querySelector('button:last-child')) {
        // The portal is physically inside the modal, but its React events bubble through HelpMenu.
        const first = [...dialog.querySelectorAll<HTMLElement>(tabStops)].find((element) => focusable(element) && shown(element));
        if (first) { event.preventDefault(); first.focus(); }
      }
    }}>
      <p className="tour-coach-label">{tour.title}</p>
      <div id={id} role="status" aria-atomic="true">
        <h2>{hint.title}</h2>
        <p>{hint.instruction}</p>
      </div>
      <div className="tour-coach-actions">
        {hint.canContinue && anchor && <button type="button" className="secondary" onClick={() => {
          manual.current.add(anchor);
          refresh.current();
        }}>Já conferi</button>}
        {anchor && !hint.complete && (fieldReady && !hint.canContinue
          ? <button type="button" className="secondary" onPointerDown={(event) => event.preventDefault()} onClick={() => {
            anchor.blur();
            refresh.current();
          }}>Próximo campo</button>
          : <button type="button" className="secondary" onClick={() => reveal(anchor, true)}>Localizar controle</button>)}
        <button type="button" className={hint.complete ? undefined : 'secondary'} onClick={hint.complete ? onComplete : onPause}>
          {hint.complete ? 'Concluir tour' : 'Pausar tour'}
        </button>
      </div>
    </aside>,
    dialog ?? document.body,
  );
}
