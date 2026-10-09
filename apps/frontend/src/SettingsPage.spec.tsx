// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { api, OperationalSettings } from './api';
import { SettingsPage } from './SettingsPage';

vi.mock('./useFormDraft', () => ({ useFormDraft: () => ({ ready: true, complete: vi.fn().mockResolvedValue(undefined) }) }));
vi.mock('./FormDrafts', () => ({ DraftActions: () => null }));

describe('configuração do intervalo de duplicidade', () => {
  async function setup() {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 100, bottom: 200 } as DOMRect);
    const configuration: OperationalSettings = { immediateSeparationMinutes: 180, recentDuplicateMinutes: 90, reviewDestinations: [], shipmentPhotos: { minimum: 1, maximum: 5 } };
    vi.spyOn(api, 'get').mockImplementation((path) => Promise.resolve(path === '/settings' ? configuration : { items: [] }));
    const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
    act(() => { root.render(<SettingsPage />); });
    for (let index = 0; index < 40 && !host.querySelector('form'); index++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    const form = [...host.querySelectorAll('form')].find((element) => element.textContent?.includes('Aviso de operação duplicada'))!;
    const input = form.querySelector<HTMLInputElement>('input')!;
    return { host, form, input, configuration, close: () => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); } };
  }
  function change(input: HTMLInputElement, value: string) {
    act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); });
  }
  async function submit(form: HTMLFormElement) {
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await Promise.resolve(); });
  }
  it('carrega o valor da API e salva minutos inteiros no endpoint existente de configurações', async () => {
    const test = await setup();
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ ...test.configuration, recentDuplicateMinutes: 120 });
    try {
      expect(test.input.value).toBe('90'); expect(test.input.min).toBe('1'); expect(test.input.max).toBe('1440');
      change(test.input, '120'); await submit(test.form);
      expect(patch).toHaveBeenCalledWith('/settings/recent-duplicates', { minutes: 120 });
      expect(test.host.textContent).toContain('Intervalo atualizado');
    } finally { test.close(); }
  });
  it('recusa frações e mostra falha de gravação sem perder o valor digitado', async () => {
    const test = await setup(); const patch = vi.spyOn(api, 'patch').mockRejectedValue(new Error('Sem conexão'));
    try {
      change(test.input, '1.5'); await submit(test.form);
      expect(patch).not.toHaveBeenCalled(); expect(test.host.textContent).toContain('intervalo inteiro');
      change(test.input, '120'); await submit(test.form);
      expect(test.host.textContent).toContain('Sem conexão'); expect(test.input.value).toBe('120');
    } finally { test.close(); }
  });
});
