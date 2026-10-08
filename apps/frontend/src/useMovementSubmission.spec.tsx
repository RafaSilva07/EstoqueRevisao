// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';
import { useMovementSubmission } from './useMovementSubmission';
import { MovementConfirmationNotice } from './MovementConfirmationNotice';

const duplicate = new ApiError('Operação idêntica recente.', 'RECENT_DUPLICATE_CONFIRMATION_REQUIRED', {
  duplicateKeys: ['MOVEMENT:previous:signature'], duplicates: [{ id: 'previous', code: 'ENT-000001', kind: 'MOVEMENT', createdAt: '2026-10-08T13:00:00Z', responsible: 'Operador A', status: 'EFETIVADA' }], windowMinutes: 30,
}, 409);

describe('conferência de possível duplicidade', () => {
  async function setup() {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
    let submission!: ReturnType<typeof useMovementSubmission>;
    const created = vi.fn();
    function Harness() {
      submission = useMovementSubmission('/movements/external-entries', created);
      return <MovementConfirmationNotice conflict={submission.conflict} />;
    }
    act(() => { root.render(<Harness />); });
    await Promise.resolve();
    return { host, created, current: () => submission, close: () => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); } };
  }
  it('mostra registro/responsável/data e exige outro clique, preservando a chave de idempotência', async () => {
    const test = await setup();
    const post = vi.spyOn(api, 'post').mockRejectedValueOnce(duplicate).mockResolvedValueOnce({ id: 'new' });
    try {
      const key = test.current().requestKey;
      await act(async () => { await test.current().submit({ quantity: 10 }); });
      expect(test.created).not.toHaveBeenCalled(); expect(post).toHaveBeenCalledTimes(1);
      expect(test.host.textContent).toContain('ENT-000001'); expect(test.host.textContent).toContain('Operador A');
      expect(test.host.textContent).toContain('08/10/2026');
      expect(test.current().confirmationLabel('Confirmar')).toBe('Conferi: continuar mesmo assim');
      await act(async () => { await test.current().submit({ quantity: 10 }); });
      expect(post.mock.calls[1][1]).toMatchObject({ requestKey: key, confirmedDuplicateKeys: duplicate.details!.duplicateKeys });
      expect(test.created).toHaveBeenCalledWith('new');
    } finally { test.close(); }
  });
  it('não aceita aviso antigo quando o preenchimento muda ou volta para conferir', async () => {
    const test = await setup(); const post = vi.spyOn(api, 'post').mockRejectedValue(duplicate);
    try {
      await act(async () => { await test.current().submit({ quantity: 10 }); });
      await act(async () => { await test.current().submit({ quantity: 11 }); });
      expect(post.mock.calls[1][1]).not.toHaveProperty('confirmedDuplicateKeys');
      act(() => test.current().resetConfirmation());
      await act(async () => { await test.current().submit({ quantity: 11 }); });
      expect(post.mock.calls[2][1]).not.toHaveProperty('confirmedDuplicateKeys');
    } finally { test.close(); }
  });
  it('mantém confirmações independentes de validade e duplicidade, sem duplo envio', async () => {
    const test = await setup();
    const post = vi.spyOn(api, 'post').mockRejectedValueOnce(new ApiError('Validade divergente', 'LOT_EXPIRATION_CONFIRMATION_REQUIRED', { expirationKeys: ['lot:date'] }))
      .mockRejectedValueOnce(duplicate).mockResolvedValueOnce({ id: 'new' });
    try {
      await act(async () => { await test.current().submit({ quantity: 10 }); });
      await act(async () => { await test.current().submit({ quantity: 10 }); });
      await act(async () => { await Promise.all([test.current().submit({ quantity: 10 }), test.current().submit({ quantity: 10 })]); });
      expect(post).toHaveBeenCalledTimes(3);
      expect(post.mock.calls[2][1]).toMatchObject({ confirmedExpirationKeys: ['lot:date'], confirmedDuplicateKeys: duplicate.details!.duplicateKeys });
    } finally { test.close(); }
  });
});
