// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, UserPreferences } from './api';
import { PreferencesPage } from './PreferencesPage';

let host: HTMLDivElement;
let root: Root;
const initial: UserPreferences = { theme: 'LIGHT', backgroundColor: null };

describe('Tela de preferências', () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  });
  afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); });

  it('salva o tema para a conta e oferece restauração do fundo padrão', async () => {
    const saved: UserPreferences = { theme: 'DARK', backgroundColor: null };
    const patch = vi.spyOn(api, 'patch').mockResolvedValue(saved);
    const onSaved = vi.fn();
    act(() => { root.render(<PreferencesPage value={initial} onSaved={onSaved} />); });
    expect(host.textContent).toContain('Cor do fundo geral');
    act(() => { host.querySelector<HTMLInputElement>('input[value="DARK"]')!.click(); });
    await act(async () => {
      host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    expect(patch).toHaveBeenCalledWith('/auth/preferences', saved);
    expect(onSaved).toHaveBeenCalledWith(saved);
    expect(host.textContent).toContain('Preferências salvas');
  });

  it('envia a cor personalizada e permite voltar ao fundo padrão', async () => {
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ theme: 'LIGHT', backgroundColor: '#F4A8C8' });
    act(() => { root.render(<PreferencesPage value={initial} onSaved={vi.fn()} />); });
    act(() => {
      const color = host.querySelector<HTMLInputElement>('input[type="color"]')!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(color, '#f4a8c8');
      color.dispatchEvent(new Event('input', { bubbles: true }));
      color.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    expect(patch).toHaveBeenCalledWith('/auth/preferences', { theme: 'LIGHT', backgroundColor: '#F4A8C8' });
    act(() => { host.querySelector<HTMLButtonElement>('.preferences-background button')!.click(); });
    expect(host.querySelector<HTMLInputElement>('input[type="color"]')?.value).toBe('#f3f5f6');
  });
});
