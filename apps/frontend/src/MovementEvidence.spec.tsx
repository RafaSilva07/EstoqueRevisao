// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MovementEvidence } from './MovementEvidence';

describe('evidências da movimentação', () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  });
  afterEach(() => { act(() => root.unmount()); host.remove(); });

  it('não carrega fotos pendentes no PCP até o operador pedir e permite ocultá-las novamente', () => {
    act(() => root.render(<MovementEvidence pendingPcp><span>Foto do produto</span></MovementEvidence>));
    const toggle = host.querySelector('button')!;
    expect(toggle.textContent).toBe('Mostrar fotos');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(host.textContent).not.toContain('Foto do produto');
    act(() => toggle.click());
    expect(toggle.textContent).toBe('Ocultar fotos');
    expect(host.textContent).toContain('Foto do produto');
    act(() => toggle.click());
    expect(host.textContent).not.toContain('Foto do produto');
  });

  it('mantém evidências de operações não pendentes visíveis', () => {
    act(() => root.render(<MovementEvidence pendingPcp={false}><span>Foto do produto</span></MovementEvidence>));
    expect(host.textContent).toContain('Foto do produto');
    expect(host.querySelector('button')).toBeNull();
  });
});
