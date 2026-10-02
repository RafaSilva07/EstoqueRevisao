// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { ManagedUser, UsersPage } from './UsersPage';
import { PermissionPresetsModal } from './PermissionPresetsModal';
import { PermissionOption, PermissionPreset, togglePermission } from './permission-selection';

const options: PermissionOption[] = [
  { code: 'movements.read', label: 'Consultar histórico', group: 'Movimentações', modes: ['REVISAO'], dependencies: [] },
  { code: 'movements.external-entry', label: 'Entrada direta na Revisão', group: 'Movimentações', modes: ['REVISAO'], dependencies: ['movements.read'] },
];
const preset: PermissionPreset = { code: 'REVISAO', name: 'Revisão operacional', modes: ['REVISAO'], permissionCodes: ['movements.read'], version: 3, userCount: 2, editable: true };
let host: HTMLDivElement;
let root: Root;
function button(label: string): HTMLButtonElement {
  const found = Array.from(document.querySelectorAll('button')).find((item) => item.textContent === label);
  expect(found).toBeTruthy();
  return found!;
}
async function click(label: string) { await act(async () => { button(label).click(); await Promise.resolve(); }); }

describe('Gestão de permissões individuais e presets', () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.useFakeTimers();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  });
  afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.useRealTimers(); });

  it.each([false, true])('pede confirmação antes de salvar e envia a opção de atualizar usuários: %s', async (applyToUsers) => {
    const save = vi.spyOn(api, 'patch').mockResolvedValue({ updatedUsers: applyToUsers ? 2 : 0 });
    const onSaved = vi.fn();
    act(() => root.render(<PermissionPresetsModal presets={[preset]} options={options} onClose={vi.fn()} onSaved={onSaved} />));
    act(() => document.querySelector<HTMLInputElement>('input[value="movements.external-entry"]')!.click());
    await click('Conferir e salvar preset');
    expect(document.body.textContent).toContain('Atualizar também os usuários deste preset?');
    expect(document.body.textContent).toContain('2 usuário(s)');
    expect(save).not.toHaveBeenCalled();
    await click(applyToUsers ? 'Salvar e atualizar usuários' : 'Salvar só o preset');
    expect(save).toHaveBeenCalledExactlyOnceWith('/users/roles/REVISAO/permissions', {
      permissionCodes: ['movements.external-entry', 'movements.read'], version: 3, applyToUsers,
    });
    expect(onSaved).toHaveBeenCalledWith(applyToUsers ? 2 : 0);
  });

  it('mostra erro do servidor e mantém a confirmação para correção', async () => {
    vi.spyOn(api, 'patch').mockRejectedValue(new Error('Preset alterado por outro administrador.'));
    const onSaved = vi.fn();
    act(() => root.render(<PermissionPresetsModal presets={[preset]} options={options} onClose={vi.fn()} onSaved={onSaved} />));
    await click('Conferir e salvar preset'); await click('Salvar só o preset');
    expect(document.body.textContent).toContain('Preset alterado por outro administrador.');
    expect(onSaved).not.toHaveBeenCalled();
    expect(button('Salvar só o preset').disabled).toBe(false);
  });

  it('preserva o acesso completo do preset ADMIN', () => {
    act(() => root.render(<PermissionPresetsModal presets={[{ ...preset, code: 'ADMIN', editable: false, modes: ['ADMIN'] }]} options={options} onClose={vi.fn()} onSaved={vi.fn()} />));
    expect(button('Conferir e salvar preset').disabled).toBe(true);
    expect(document.querySelector('fieldset')?.disabled).toBe(true);
  });

  it('salva uma permissão individual mantendo o preset e o setor do usuário', async () => {
    const user: ManagedUser = { id: 'operator', username: 'operador', sector: 'REVISAO', status: 'ACTIVE', roles: [{ code: preset.code, name: preset.name }],
      createdAt: '2026-10-02T12:00:00Z', updatedAt: '2026-10-02T12:00:00Z', permissionCodes: ['movements.read'], presetPermissionCodes: ['movements.read'], permissionOverrides: [] };
    vi.spyOn(api, 'get').mockImplementation((path) => Promise.resolve(path === '/users/roles' ? [preset] : path === '/users/permissions' ? options
      : { items: [user], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } }));
    const save = vi.spyOn(api, 'patch').mockResolvedValue(user);
    act(() => root.render(<UsersPage currentUserId="admin" onOwnUpdate={vi.fn()} />));
    await act(async () => { await vi.advanceTimersByTimeAsync(210); });
    await click('Editar');
    act(() => document.querySelector<HTMLInputElement>('input[value="movements.external-entry"]')!.click());
    await click('Salvar usuário');
    await act(async () => { await vi.advanceTimersByTimeAsync(210); });
    expect(save).toHaveBeenCalledWith('/users/operator', expect.objectContaining({
      sector: 'REVISAO', roleCodes: ['REVISAO'], permissionCodes: ['movements.external-entry', 'movements.read'], applyPreset: false,
    }));
  });

  it('seleciona leituras necessárias e remove ações dependentes ao desmarcá-las', () => {
    expect(togglePermission(options, [], 'movements.external-entry', true)).toEqual(['movements.external-entry', 'movements.read']);
    expect(togglePermission(options, ['movements.external-entry', 'movements.read'], 'movements.read', false)).toEqual([]);
  });
});
