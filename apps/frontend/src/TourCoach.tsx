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
  context?: string;
};
type ViewBounds = { left: number; top: number; right: number; bottom: number };
type AnchorSide = 'above' | 'below' | 'left' | 'right';
type ScrollMove = { container: HTMLElement; from: number; to: number };

const resultTargets = ['product-result', 'receipt-result', 'shipment-result'];
const reviewableTargets = ['product-unit', 'receipt-separation', 'separation-amount', 'assembly-mixed', 'shipment-expiry'];
const tabStops = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]';
const anchorGap = 12;
const transitionDuration = 280;

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
  return element.matches(tabStops) && element.tabIndex >= 0 && !element.closest('[inert]');
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
  return { left, top: ceiling, right, bottom };
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

function clientBox(element: HTMLElement): ViewBounds {
  const rect = element.getBoundingClientRect();
  const left = rect.left + element.clientLeft;
  const top = rect.top + element.clientTop;
  return { left, top, right: left + element.clientWidth, bottom: top + element.clientHeight };
}

function scrollArea(anchor: HTMLElement, dialog: HTMLElement | null, bounds: ViewBounds) {
  let area = bounds;
  for (let parent = anchor.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    const clipsX = parent === dialog || /^(auto|scroll|hidden|clip)$/.test(style.overflowX);
    const clipsY = parent === dialog || /^(auto|scroll|hidden|clip)$/.test(style.overflowY);
    if (clipsX || clipsY) {
      const rect = clientBox(parent);
      area = intersection(area, {
        left: clipsX ? rect.left : area.left, right: clipsX ? rect.right : area.right,
        top: clipsY ? rect.top : area.top, bottom: clipsY ? rect.bottom : area.bottom,
      });
    }
    if (parent === dialog) break;
  }
  return area;
}

function revealPlan(anchor: HTMLElement, dialog: HTMLElement | null, view: ViewBounds) {
  const top = anchorBox(anchor).top;
  const root = document.scrollingElement;
  const moves: ScrollMove[] = [];
  let shift = 0;
  function scroll(container: HTMLElement, area: ViewBounds) {
    if (typeof container.scrollBy !== 'function') return;
    const available = container.scrollHeight - container.clientHeight;
    if (available <= 0) return;
    const height = area.bottom - area.top;
    const target = area.top + (height < 240 ? 8 : clamp(height * .12, 16, 64));
    const delta = clamp(top + shift - target, -container.scrollTop, available - container.scrollTop);
    if (Math.abs(delta) <= 1) return;
    moves.push({ container, from: container.scrollTop, to: container.scrollTop + delta });
    shift -= delta;
  }
  for (let parent = anchor.parentElement; parent && parent !== root; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    if (style.position === 'sticky') return { moves, shift };
    if (parent === dialog || /^(auto|scroll)$/.test(style.overflowY)) scroll(parent, intersection(view, clientBox(parent)));
    if (parent === dialog) break;
  }
  if (!dialog && root instanceof HTMLElement) scroll(root, view);
  return { moves, shift };
}

function moveScroll(moves: ScrollMove[], progress: number) {
  for (const { container, from, to } of moves) {
    const difference = from + (to - from) * progress - container.scrollTop;
    if (container.isConnected && Math.abs(difference) > .5) container.scrollBy({ top: difference, behavior: 'instant' });
  }
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
    && previous.previewIndex === next.previewIndex && previous.editingOther === next.editingOther && previous.context === next.context
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
  const focusAfterAdvance = useRef<number | null>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const focusOperation = useRef(false);
  const manual = useRef(new WeakSet<HTMLElement>());
  const refresh = useRef<() => void>(() => undefined);
  const refreshPosition = useRef<() => void>(() => undefined);
  const staleResults = useRef<Partial<Record<string, { element: HTMLElement; message: string }>> | null>(null);
  const revealPending = useRef(false);
  const previousHint = useRef<{ title: string; previewIndex: number | null; anchor: HTMLElement | null; panel: HTMLElement; paused: boolean } | null>(null);
  const positionHistory = useRef<{ panel: HTMLElement; left: number; top: number } | null>(null);

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
      const heading = dialog ? document.getElementById(dialogTitle ?? '') : main.querySelector<HTMLElement>('.page-header h1, h1');
      let anchor = find(memo.target) ?? preview?.related?.map(find).find(Boolean) ?? undefined;
      let context: string | undefined;
      if (preview && !anchor) {
        const prerequisite = preview.prerequisite;
        anchor = prerequisite ? find(prerequisite.target) : undefined;
        context = anchor ? prerequisite?.message : 'O controle desta etapa ainda não está disponível. Você pode continuar a prévia.';
        anchor ??= heading ?? undefined;
      }
      if (memo.target === 'status' && !anchor) anchor = heading ?? undefined;
      const editingOther = active instanceof HTMLElement && active !== anchor && active.matches('input, textarea, select, [role="combobox"]');
      const popup = anchor?.getAttribute('aria-expanded') === 'true' ? document.getElementById(anchor.getAttribute('aria-controls') ?? '') : null;
      const next = { hint: memo, anchor: anchor ?? null, dialog, popup, previewIndex, editingOther, context };
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
    const observer = new MutationObserver((records) => {
      schedule();
      if (records.some(({ type, target }) => type === 'childList' && target instanceof Element && !target.closest('.tour-coach'))) {
        refreshPosition.current();
      }
    });
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
    // Resolve a preview step before waiting for the next animation frame.
    if (preview) scan();
    else schedule();
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
    const control = paused || anchor?.id === 'main-content' ? null : anchor;
    const highlight = placement.hint.complete ? null : control;
    if (highlight) {
      highlight.setAttribute('data-tour-highlight', '');
      const descriptions = highlight.getAttribute('aria-describedby')?.split(/\s+/).filter(Boolean) ?? [];
      highlight.setAttribute('aria-describedby', [...descriptions, id].join(' '));
    }

    let frame = 0;
    let transitionFrame = 0;
    let layoutPending = false;
    let attachment: { left: number; top: number } | null = null;
    let travel: ScrollMove[] = [];

    function availableRoom() {
      const view = viewport(dialog);
      return dialog && control ? intersection(view, clientBox(dialog)) : view;
    }

    function focusAdvance(room: ViewBounds) {
      if (focusAfterAdvance.current === null || focusAfterAdvance.current !== placement?.previewIndex) return;
      const next = nextButton.current;
      if (!next || panel?.inert) return;
      const active = document.activeElement;
      if (active !== dialog && active !== document.body) {
        focusAfterAdvance.current = null;
        return;
      }
      const button = next.getBoundingClientRect();
      if (button.top >= room.top - 1 && button.bottom <= room.bottom + 1
        && button.left >= room.left - 1 && button.right <= room.right + 1) {
        next.focus({ preventScroll: true });
        if (document.activeElement === next) focusAfterAdvance.current = null;
      }
    }

    function place(left: number, top: number, attached: boolean) {
      if (!panel) return;
      let x = left;
      let y = top;
      if (attached && dialog) {
        const rect = dialog.getBoundingClientRect();
        x += dialog.scrollLeft - rect.left - dialog.clientLeft;
        y += dialog.scrollTop - rect.top - dialog.clientTop;
      } else if (attached) {
        x += window.scrollX;
        y += window.scrollY;
      }
      panel.toggleAttribute('data-attached', attached);
      panel.style.left = `${x}px`;
      panel.style.top = `${y}px`;
      panel.style.visibility = 'visible';
      const displayed = panel.getBoundingClientRect();
      positionHistory.current = { panel, left: displayed.left, top: displayed.top };
      if (panel.hasAttribute('data-moving')) return;
      const room = availableRoom();
      panel.inert = attached && !visibleBox({ left, top, right: left + panel.offsetWidth, bottom: top + panel.offsetHeight }, room);
      focusAdvance(room);
    }

    function attachedPosition() {
      if (!control?.isConnected || !attachment) return;
      const rect = anchorBox(control);
      return { left: rect.left + attachment.left, top: rect.top + attachment.top };
    }

    function followScroll() {
      // Keep the side and gap from the current layout as the control scrolls.
      const next = attachedPosition();
      if (next) place(next.left, next.top, true);
    }

    function position(shift = 0) {
      if (!panel || !content) return;
      const view = viewport(dialog);
      const room = availableRoom();
      const bounds = { left: room.left + 8, top: room.top + 8, right: room.right - 8, bottom: room.bottom - 8 };
      const width = Math.min(352, bounds.right - bounds.left);
      const availableHeight = Math.min(320, bounds.bottom - bounds.top);
      if (width <= 0 || availableHeight <= 0) { panel.style.visibility = 'hidden'; return; }

      panel.style.width = `${width}px`;
      // Measure without the height limit from the previous step or loading screen.
      panel.style.maxHeight = `${availableHeight}px`;
      panel.toggleAttribute('data-compact', bounds.bottom - bounds.top < 480);
      const detail = details.current;
      function measure(body: HTMLDivElement) {
        const header = body.querySelector('header');
        const footer = body.querySelector('footer');
        const padding = getComputedStyle(body);
        const footerGap = footer ? Number.parseFloat(getComputedStyle(footer).marginTop) || 0 : 0;
        const chrome = (header?.offsetHeight ?? 0) + (footer?.offsetHeight ?? 0) + footerGap
          + (Number.parseFloat(padding.paddingTop) || 0) + (Number.parseFloat(padding.paddingBottom) || 0)
          + body.offsetHeight - body.clientHeight;
        const desired = Math.min(availableHeight, chrome + (detail?.scrollHeight ?? 0));
        return { chrome, desired, usable: Math.min(desired, chrome + 64) };
      }
      let size = measure(content);
      const area = control ? scrollArea(control, dialog, view) : room;
      // Fit at the scroll destination and keep that offset from the live control.
      const anchorRect = control ? anchorBox(control) : null;
      const rect = anchorRect && { left: anchorRect.left, right: anchorRect.right, top: anchorRect.top + shift, bottom: anchorRect.bottom + shift };
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
        const preferBelow = Boolean(control);
        const fit = () => anchoredPosition(box, avoid, bounds, width, size.desired, size.usable, preferBelow)
          ?? anchoredPosition(box, [box], bounds, width, size.desired, 1, preferBelow);
        let best = fit();
        if ((!best || best.maxHeight < size.usable) && !panel.hasAttribute('data-compact')) {
          panel.setAttribute('data-compact', '');
          size = measure(content);
          best = fit();
        }
        if (best) {
          ({ left, top, side } = best);
          const detailMinimum = panel.hasAttribute('data-compact') ? 16 : 24;
          maxHeight = Math.min(availableHeight, Math.max(Math.min(size.desired, size.chrome + detailMinimum), best.maxHeight));
          alignEnd = side === 'above';
        } else if (rect) {
          left = rect.left;
          alignEnd = (rect.top + rect.bottom) / 2 > (bounds.top + bounds.bottom) / 2;
          side = alignEnd ? 'above' : 'below';
          top = alignEnd ? rect.top - anchorGap : rect.bottom + anchorGap;
        } else {
          left = box.left;
          alignEnd = (box.top + box.bottom) / 2 < (bounds.top + bounds.bottom) / 2;
          top = alignEnd ? bounds.bottom : bounds.top;
        }
      }

      panel.style.maxHeight = `${maxHeight}px`;
      // A scrollbar can narrow the card and wrap its header or actions.
      const clippedHeight = content.scrollHeight - content.clientHeight;
      if (clippedHeight > 0) {
        panel.style.maxHeight = `${Math.min(maxHeight + clippedHeight, availableHeight)}px`;
      }
      const height = panel.offsetHeight;
      if (side !== 'left' && side !== 'right') left = clamp(left, bounds.left, bounds.right - width);
      if (alignEnd) top -= height;
      top = clamp(top, bounds.top, bounds.bottom - height);
      if (rect && side && !visibleBox(rect, { left, top, right: left + width, bottom: top + height })) {
        const horizontal = side === 'above' || side === 'below';
        const offset = horizontal
          ? clamp((rect.left + rect.right) / 2 - left, 16, width - 16)
          : clamp((rect.top + rect.bottom) / 2 - top, 16, height - 16);
        panel.dataset.anchorSide = side;
        panel.style.setProperty('--tour-pointer', `${offset}px`);
      } else {
        delete panel.dataset.anchorSide;
      }

      attachment = rect ? { left: left - rect.left, top: top - rect.top } : null;
      place(left, top - shift, Boolean(attachment));
      return { left, top: top - shift };
    }

    function stopTransition() {
      cancelAnimationFrame(transitionFrame);
      transitionFrame = 0;
      travel = [];
      panel?.removeAttribute('data-moving');
      panel?.style.removeProperty('transform');
    }

    function interruptTransition() {
      if (!transitionFrame) return;
      stopTransition();
      if (attachment) followScroll();
      else position();
    }

    function onMotionChange() {
      if (!reducedMotion.matches || !transitionFrame) return;
      moveScroll(travel, 1);
      stopTransition();
      position();
    }

    function animateStep(plan: { moves: ScrollMove[]; shift: number }) {
      if (!panel) return;
      const origin = positionHistory.current;
      panel.setAttribute('data-moving', '');
      panel.inert = false;
      const base = position(plan.shift);
      if (!base) { stopTransition(); return; }

      const room = availableRoom();
      const dx = clamp(origin?.left ?? base.left, room.left + 8, room.right - panel.offsetWidth - 8) - base.left;
      const dy = clamp(origin?.top ?? base.top + 6, room.top + 8, room.bottom - panel.offsetHeight - 8) - base.top;
      if (!plan.moves.length && Math.abs(dx) + Math.abs(dy) < 1) {
        stopTransition();
        position();
        return;
      }
      travel = plan.moves;
      const started = performance.now();
      function draw(progress: number) {
        moveScroll(travel, progress);
        if (!panel || !base) return;
        const next = attachedPosition() ?? base;
        const visible = availableRoom();
        // A concurrent layout or scroll change can invalidate the projected destination.
        const x = clamp(next.left + dx * (1 - progress), visible.left + 8, visible.right - panel.offsetWidth - 8);
        const y = clamp(next.top + dy * (1 - progress), visible.top + 8, visible.bottom - panel.offsetHeight - 8);
        panel.style.transform = `translate(${x - next.left}px, ${y - next.top}px)`;
        place(next.left, next.top, Boolean(attachment));
      }
      function tick(now: number) {
        const elapsed = clamp((now - started) / transitionDuration, 0, 1);
        draw(1 - (1 - elapsed) ** 3);
        if (elapsed < 1) transitionFrame = requestAnimationFrame(tick);
        else {
          stopTransition();
          layoutPending = false;
          // The scroll range can change while content loads. Fit against the actual result.
          position();
        }
      }
      draw(0);
      // The first frame already fits the card within the visible room.
      focusAdvance(availableRoom());
      transitionFrame = requestAnimationFrame(tick);
    }

    function schedule() {
      if (frame || transitionFrame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (layoutPending || !attachment) {
          layoutPending = false;
          position();
        } else followScroll();
      });
    }
    function scheduleLayout() { layoutPending = true; schedule(); }
    const previous = previousHint.current;
    const stepChanged = previous?.panel !== panel || previous?.anchor !== anchor || previous?.title !== placement.hint.title
      || previous?.previewIndex !== placement.previewIndex || previous.paused !== paused;
    if (stepChanged) revealPending.current = Boolean(control);
    const follow = focusOperation.current && placement.previewIndex === null && !paused;
    if (follow) {
      focusOperation.current = false;
      if (anchor && focusable(anchor)) {
        anchor.focus({ preventScroll: true });
      }
    }
    if (stepChanged && details.current) details.current.scrollTop = 0;
    const shouldReveal = follow || (revealPending.current && (!placement.editingOther || focusAfterAdvance.current !== null));
    if (shouldReveal) revealPending.current = false;
    const plan = control && shouldReveal ? revealPlan(control, dialog, viewport(dialog)) : { moves: [], shift: 0 };
    if (reducedMotion.matches || (!stepChanged && plan.moves.length === 0)) {
      moveScroll(plan.moves, 1);
      position();
    } else animateStep(plan);
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
    const observed = [anchor, dialog ?? document.getElementById('main-content') ?? document.body, popup]
      .filter((element): element is HTMLElement => element !== null);
    const sizes = new Map(observed.map((element) => [element, { width: element.clientWidth, height: element.clientHeight }]));
    const resize = new ResizeObserver((entries) => {
      for (const { target } of entries) {
        if (!(target instanceof HTMLElement)) continue;
        const previousSize = sizes.get(target);
        const width = target.clientWidth;
        const height = target.clientHeight;
        if (previousSize?.width === width && previousSize.height === height) continue;
        sizes.set(target, { width, height });
        scheduleLayout();
      }
    });
    refreshPosition.current = schedule;
    observed.forEach((element) => resize.observe(element));
    document.addEventListener('scroll', schedule, true);
    document.addEventListener('wheel', interruptTransition, { capture: true, passive: true });
    document.addEventListener('touchmove', interruptTransition, { capture: true, passive: true });
    window.addEventListener('resize', scheduleLayout);
    window.visualViewport?.addEventListener('resize', scheduleLayout);
    window.visualViewport?.addEventListener('scroll', schedule);
    reducedMotion.addEventListener('change', onMotionChange);
    return () => {
      cancelAnimationFrame(frame);
      if (transitionFrame && travel.length) revealPending.current = true;
      stopTransition();
      refreshPosition.current = () => undefined;
      resize.disconnect();
      document.removeEventListener('scroll', schedule, true);
      document.removeEventListener('wheel', interruptTransition, true);
      document.removeEventListener('touchmove', interruptTransition, true);
      window.removeEventListener('resize', scheduleLayout);
      window.visualViewport?.removeEventListener('resize', scheduleLayout);
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
  const { anchor, context, dialog, hint, previewIndex: displayedStep } = placement;
  function wrapTab(event: React.KeyboardEvent<HTMLElement>) {
    // Portal events reach HelpMenu, so wrap the physical modal's tab order here.
    if (event.key !== 'Tab' || event.shiftKey || !dialog
      || event.target !== [...event.currentTarget.querySelectorAll('button:not(:disabled)')].at(-1)) return;
    const first = [...dialog.querySelectorAll<HTMLElement>(tabStops)].find((element) => focusable(element) && shown(element));
    if (first) { event.preventDefault(); first.focus(); }
  }

  function advance() {
    if (complete) { onEnd(); return; }
    nextButton.current?.focus({ preventScroll: true });
    const nextIndex = Math.min(stepIndex + 1, steps.length - 1);
    const next = steps[nextIndex];
    const opener = next.opensWith;
    const scope = dialog ?? document.getElementById('main-content');
    const targetExists = [...scope?.querySelectorAll<HTMLElement>(`[data-tour="${next.target}"]`) ?? []].some(shown);
    const prerequisite = opener?.checked && scope?.querySelector<HTMLInputElement>(`input[data-tour="${opener.checked}"]`);
    focusAfterAdvance.current = nextIndex;
    // These buttons only open the next screen. Previewing never confirms an operation.
    if (opener && !targetExists && anchor instanceof HTMLButtonElement && !anchor.disabled && anchor.dataset.tour === opener.target
      && (!opener.checked || (prerequisite && prerequisite.checked))) {
      anchor.click();
    }
    setPreviewIndex(nextIndex);
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
              {context && <p className="tour-coach-context">{context}</p>}
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
