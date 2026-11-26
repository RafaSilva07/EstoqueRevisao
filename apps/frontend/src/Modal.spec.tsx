// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Modal } from './components';

describe('modal no celular', () => {
  it('restaura a rolagem após fechar simultaneamente modais sobrepostos no desktop', () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
    document.body.style.overflow = 'auto';
    act(() => root.render(<><Modal labelledBy="original" onClose={() => undefined}><h2 id="original">Formulário</h2></Modal><Modal labelledBy="draft" onClose={() => undefined}><h2 id="draft">Salvar rascunho</h2></Modal></>));
    expect(document.body.style.overflow).toBe('hidden');
    act(() => root.unmount()); expect(document.body.style.overflow).toBe('auto'); host.remove();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.style.overflow = '';
  });

  it('mantém o foco entre os controles visíveis quando o tour sai de vista', () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const rects = vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([new DOMRect(0, 0, 50, 44)] as unknown as DOMRectList);
    const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
    try {
      act(() => root.render(<Modal labelledBy="form-title" onClose={() => undefined}>
        <h2 id="form-title">Formulário</h2><button>Voltar</button><button>Salvar</button>
        <aside style={{ visibility: 'hidden' }}><button>Fechar tour</button></aside>
      </Modal>));
      const [first, last] = host.querySelectorAll('button');
      const backwards = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
      act(() => {
        first.focus();
        first.dispatchEvent(backwards);
      });
      expect(backwards.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(last);
      act(() => { last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })); });
      expect(document.activeElement).toBe(first);
    } finally {
      act(() => root.unmount());
      host.remove();
      rects.mockRestore();
    }
  });

  it('mantém a página rolável e acompanha a área visível quando o teclado abre', () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    const listeners = new Map<string, EventListener>();
    const viewport = {
      offsetTop: 12,
      height: 420,
      addEventListener: (name: string, listener: EventListener) => listeners.set(name, listener),
      removeEventListener: (name: string) => listeners.delete(name),
    };
    vi.stubGlobal('visualViewport', viewport);
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    document.body.style.overflow = 'auto';

    act(() => root.render(<Modal labelledBy="modal-title" onClose={() => undefined}>
      <h2 id="modal-title">Adicionar produto</h2><input aria-label="Quantidade" />
    </Modal>));

    const backdrop = host.querySelector<HTMLElement>('.dialog-backdrop')!;
    expect(document.body.style.overflow).toBe('auto');
    expect(backdrop.style.top).toBe('12px');
    expect(backdrop.style.height).toBe('420px');
    expect(backdrop.style.getPropertyValue('--modal-viewport-height')).toBe('420px');

    const input = host.querySelector('input')!;
    const scrollIntoView = vi.fn();
    input.scrollIntoView = scrollIntoView;
    input.focus();
    viewport.height = 300;
    listeners.get('resize')?.(new Event('resize'));
    expect(backdrop.style.height).toBe('300px');
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    listeners.get('scroll')?.(new Event('scroll'));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
    host.remove();
    expect(listeners.size).toBe(0);
  });
});
