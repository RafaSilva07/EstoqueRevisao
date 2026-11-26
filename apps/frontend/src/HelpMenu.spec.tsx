// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserSession } from './api';
import { HelpMenu } from './HelpMenu';
import { availableHelpTours } from './help-tours';
import { userForOperationalMode } from './operational-mode';

const reviewer: UserSession = {
  id: 'reviewer', username: 'revisao', sector: 'REVISAO', roles: ['REVISAO'],
  permissions: ['products.read', 'products.create', 'shipments.read', 'shipments.decide', 'shipments.create', 'movements.review'],
};

describe('tours disponíveis por modo operacional e permissão', () => {
  it('mostra os quatro fluxos de Revisão e esconde ações sem permissão efetiva', () => {
    expect(availableHelpTours(reviewer, 'REVISAO').map(({ id }) => id)).toEqual([
      'review-product-create', 'review-receive', 'review-stock', 'review-assembly',
    ]);
    expect(availableHelpTours({ ...reviewer, permissions: ['products.read', 'shipments.create', 'shipments.decide'] }, 'REVISAO')).toEqual([]);
  });

  it('usa o modo selecionado para a conta com acesso aos dois setores', () => {
    const admin: UserSession = { ...reviewer, roles: ['ADMIN_REVISAO_EXPEDICAO'] };
    const expedition = userForOperationalMode(admin, 'EXPEDICAO');
    expect(availableHelpTours(expedition, 'EXPEDICAO').map(({ id }) => id)).toEqual([
      'expedition-send', 'expedition-receive',
    ]);
    expect(availableHelpTours(expedition, 'REVISAO')).toEqual([]);
    expect(availableHelpTours(reviewer, 'ADMIN')).toEqual([]);
    expect(availableHelpTours(reviewer, 'PCP')).toEqual([]);
    expect(availableHelpTours(reviewer, 'PRODUCAO')).toEqual([]);
  });
});

describe('menu de ajuda', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  function clickButton(label: string) {
    const button = Array.from(host.querySelectorAll('button')).find((candidate) => candidate.textContent?.trim() === label);
    if (!button) throw new Error(`Botão ausente: ${label}`);
    act(() => {
      button.focus();
      button.click();
    });
    return button;
  }

  it('abre a operação escolhida e permite pausar e retomar pela Ajuda', () => {
    const navigate = vi.fn();
    const render = (page: 'home' | 'products') => {
      act(() => root.render(<HelpMenu user={reviewer} mode="REVISAO" page={page} navigate={navigate} />));
    };
    render('home');
    const trigger = clickButton('Ajuda');
    clickButton('Cadastrar produto');
    expect(navigate).toHaveBeenCalledExactlyOnceWith('products');
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    render('products');
    clickButton('Ajuda');
    clickButton('Pausar tour');
    expect(host.textContent).toContain('Continuar tour de cadastrar produto');
    clickButton('Continuar tour de cadastrar produto');
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[role="dialog"]')).toBeNull();

    render('home');
    clickButton('Ajuda');
    clickButton('Continuar tour de cadastrar produto');
    expect(navigate).toHaveBeenCalledTimes(2);
  });

  it('exibe o rascunho educacional e as fontes mesmo sem tours disponíveis', () => {
    const navigate = vi.fn();
    act(() => root.render(<HelpMenu user={{ ...reviewer, sector: 'PCP' }} mode="PCP" page="home" navigate={navigate} />));
    clickButton('Ajuda');
    expect(host.textContent).toContain('Não há tours disponíveis');
    clickButton('Termos de uso');
    expect(document.activeElement?.textContent).toBe('Termos de uso');
    expect(host.textContent).toContain('Rascunho educacional · versão 0.1');
    expect(host.textContent).toContain('Elaboração: Rafael Silva e João Victor Fernandes');
    expect(host.textContent).toContain('Responsável pela revisão');
    expect(host.textContent).toContain('Dúvidas pendentes');
    expect(host.querySelectorAll('.help-terms a')).toHaveLength(3);
    expect(navigate).not.toHaveBeenCalled();
  });

  it.each([{ reduced: true }, { reduced: false }])('avança e fecha o tour preservando o formulário (movimento reduzido: $reduced)', async ({ reduced }) => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    vi.stubGlobal('matchMedia', () => ({ matches: reduced, addEventListener() {}, removeEventListener() {} }));
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.stubGlobal('visualViewport', { width: 320, height: 460, offsetTop: 0, offsetLeft: 0, addEventListener() {}, removeEventListener() {} });
    const field = (top: number) => new DOMRect(20, top, 280, 48);
    const clientRects = vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([field(60)] as unknown as DOMRectList);
    const clientWidth = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function(this: HTMLElement) {
      return this.getAttribute('role') === 'dialog' ? 304 : 0;
    });
    const clientHeight = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function(this: HTMLElement) {
      return this.getAttribute('role') === 'dialog' ? 444 : 0;
    });
    const scrollHeight = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function(this: HTMLElement) {
      return this.getAttribute('role') === 'dialog' ? 1000 : 0;
    });
    const offsetHeight = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function(this: HTMLElement) {
      return this.matches('.tour-coach') ? 120 : 0;
    });
    const offsetWidth = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function(this: HTMLElement) {
      return this.matches('.tour-coach') ? 288 : 0;
    });
    let scrollTop = 0;
    const clientRect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function(this: HTMLElement) {
      if (this.getAttribute('role') === 'dialog') return new DOMRect(8, 8, 304, 444);
      if (this.dataset.tour === 'product-code') return field(100 - scrollTop);
      if (this.dataset.tour === 'product-name') return field(350 - scrollTop);
      return field(60);
    });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 16));
    vi.stubGlobal('cancelAnimationFrame', clearTimeout);
    const scroll = vi.fn(function(this: HTMLElement, { top }: ScrollToOptions) {
      this.scrollTop = scrollTop = Math.max(0, scrollTop + (top ?? 0));
    });
    const originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollBy');
    Object.defineProperty(HTMLElement.prototype, 'scrollBy', { configurable: true, value: scroll });
    try {
      const save = vi.fn();
      act(() => root.render(<>
        <HelpMenu user={reviewer} mode="REVISAO" page="products" navigate={vi.fn()} />
        <main id="main-content" />
      </>));
      clickButton('Ajuda');
      clickButton('Cadastrar produto');
      const finishMotion = () => act(() => { vi.advanceTimersByTime(320); });
      act(() => { vi.advanceTimersByTime(16); });
      finishMotion();
      const clickCoach = (label: string, finish = true) => {
        const button = [...document.querySelectorAll<HTMLButtonElement>('.tour-coach button')]
          .find((item) => (item.getAttribute('aria-label') ?? item.textContent) === label)!;
        act(() => { button.focus(); button.click(); });
        act(() => { vi.advanceTimersByTime(16); });
        if (finish) finishMotion();
      };
      // The next step is available even when the operation provided no usable control.
      clickCoach('Próximo passo');
      expect(document.querySelector('.tour-coach h2')?.textContent).toBe('Informe o código');
      clickCoach('Passo anterior');
      expect(document.querySelector('.tour-coach h2')?.textContent).toBe('Abra o cadastro');
      clickCoach('Acompanhar operação');

      const open = vi.fn(() => renderProduct(true));
      function renderProduct(showForm: boolean) {
        root.render(<>
          <HelpMenu user={reviewer} mode="REVISAO" page="products" navigate={vi.fn()} />
          <main id="main-content"><button data-tour="product-new" onClick={open}>+ Novo produto</button></main>
          {showForm && <div className="dialog-backdrop">
            <section role="dialog" aria-labelledby="product-form-title" tabIndex={-1}>
              <h2 id="product-form-title">Novo produto</h2>
              <form data-tour="product-form" onSubmit={save}>
                <input data-tour="product-code" required />
                <input data-tour="product-name" defaultValue="Rascunho" />
                <button type="submit" data-tour="product-save">Salvar produto</button>
              </form>
            </section>
          </div>}
        </>);
      }
      act(() => renderProduct(false));
      await act(async () => { await Promise.resolve(); vi.advanceTimersByTime(16); });
      finishMotion();
      expect(document.querySelector('.tour-coach h2')?.textContent).toBe('Abra o cadastro');
      expect(open).not.toHaveBeenCalled();
      clickCoach('Próximo passo');
      expect(open).toHaveBeenCalledTimes(1);
      expect(document.querySelector('.tour-coach h2')?.textContent).toBe('Informe o código');
      expect(host.querySelector('[data-tour="product-code"]')?.hasAttribute('data-tour-highlight')).toBe(true);
      const dialog = host.querySelector<HTMLElement>('[role="dialog"]')!;
      const coach = dialog.querySelector<HTMLElement>('.tour-coach')!;
      expect(document.activeElement).toBe(coach.querySelector('footer button:last-child'));
      const manualScroll = (offset: number) => {
        dialog.scrollTop = scrollTop = offset;
        act(() => {
          dialog.dispatchEvent(new Event('scroll'));
          vi.advanceTimersByTime(16);
        });
      };
      expect(coach.hasAttribute('data-attached')).toBe(true);
      expect(coach.style.top).toBe('152px');
      scroll.mockClear();
      manualScroll(40);
      expect(coach.style.top).toBe('152px');
      manualScroll(180);
      expect(coach.style.top).toBe('152px');
      expect(coach.inert).toBe(false);
      manualScroll(290);
      expect(coach.inert).toBe(true);
      expect(coach.style.visibility).toBe('visible');
      manualScroll(0);
      expect(coach.dataset.anchorSide).toBe('below');
      expect(coach.style.visibility).toBe('visible');
      expect(scroll).not.toHaveBeenCalled();
      clickCoach('Próximo passo', false);
      expect(document.querySelector('.tour-coach h2')?.textContent).toBe('Informe a descrição');
      if (reduced) {
        expect(scroll).toHaveBeenCalledExactlyOnceWith({ top: 288.72, behavior: 'instant' });
      } else {
        const initialTransform = coach.style.transform;
        expect(coach.hasAttribute('data-moving')).toBe(true);
        expect(initialTransform).toMatch(/^translate\(/);
        expect(scrollTop).toBe(0);
        act(() => { vi.advanceTimersByTime(96); });
        expect(coach.style.transform).not.toBe(initialTransform);
        expect(scrollTop).toBeGreaterThan(0);
        expect(scrollTop).toBeLessThan(288.72);
        finishMotion();
        expect(scrollTop).toBeCloseTo(288.72, 0);
      }
      expect(coach.hasAttribute('data-moving')).toBe(false);
      expect(coach.style.transform).toBe('');
      expect(document.querySelector('.tour-coach-stage')?.textContent).toBe('Prévia · Etapa 3 de 10');
      expect(coach.dataset.anchorSide).toBe('below');
      expect(coach.style.top).toBe('402px');
      manualScroll(210);
      expect(coach.style.top).toBe('402px');
      expect(coach.dataset.anchorSide).toBe('below');
      manualScroll(400);
      expect(coach.inert).toBe(false);
      manualScroll(550);
      expect(coach.inert).toBe(true);
      manualScroll(289);
      expect(coach.inert).toBe(false);
      act(() => {
        document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });
      expect(document.activeElement?.textContent).toBe('Retomar tour');
      clickCoach('Retomar tour');
      expect(document.activeElement?.textContent).toBe('Próximo passo');
      expect(document.querySelector('.tour-coach h2')?.textContent).toBe('Informe a descrição');
      const code = host.querySelector<HTMLInputElement>('[data-tour="product-code"]');
      const name = host.querySelector<HTMLInputElement>('[data-tour="product-name"]');
      expect(dialog?.querySelector('.tour-coach')).toBeTruthy();
      clickCoach('Acompanhar operação');
      expect(document.activeElement).toBe(code);
      clickCoach('Próximo passo');
      clickCoach('Fechar tour');
      expect(dialog?.querySelector('.tour-coach')).toBeNull();
      expect(document.activeElement).toBe(dialog);
      expect(code?.value).toBe('');
      expect(name?.value).toBe('Rascunho');
      expect(name?.hasAttribute('data-tour-highlight')).toBe(false);
      expect(save).not.toHaveBeenCalled();
      clickButton('Ajuda');
      expect(host.textContent).not.toContain('Continuar tour');
    } finally {
      if (originalScroll) Object.defineProperty(HTMLElement.prototype, 'scrollBy', originalScroll);
      else Reflect.deleteProperty(HTMLElement.prototype, 'scrollBy');
      clientRects.mockRestore();
      clientRect.mockRestore();
      clientWidth.mockRestore();
      clientHeight.mockRestore();
      scrollHeight.mockRestore();
      offsetHeight.mockRestore();
      offsetWidth.mockRestore();
      vi.useRealTimers();
    }
  });

  it('vincula o painel ao botão e permite voltar à navegação da página', () => {
    act(() => root.render(<>
      <HelpMenu user={reviewer} mode="REVISAO" page="home" navigate={vi.fn()} />
      <button type="button">Outro controle</button>
    </>));

    const trigger = clickButton('Ajuda');
    const panel = host.querySelector('[role="dialog"]');
    expect(panel?.id).toBe(trigger.getAttribute('aria-controls'));
    expect(panel?.parentElement).toBe(trigger.parentElement);
    expect(panel?.hasAttribute('aria-modal')).toBe(false);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    clickButton('Ajuda');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);

    clickButton('Ajuda');
    const outside = clickButton('Outro controle');
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(outside);

    clickButton('Ajuda');
    act(() => {
      outside.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });
});
