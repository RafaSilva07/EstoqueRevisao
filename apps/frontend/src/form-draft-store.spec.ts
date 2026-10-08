// @vitest-environment jsdom
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { api } from './api';
import { formDraftStore } from './form-draft-store';

describe('sincronização de rascunhos entre dispositivos', () => {
  const key = 'account:EXPEDICAO:shipment:EXPEDICAO';
  let remote: { version: number; record: { title: string; updatedAt: string; value: unknown; files: Array<{ name: string; lastModified: number; mimeType: string }> } | null };
  let get: MockInstance<typeof api.get>; let post: MockInstance<typeof api.postMultipart>; let remove: MockInstance<typeof api.delete>;
  beforeEach(() => {
    formDraftStore.setAccount(null); formDraftStore.setAccount('account');
    vi.stubGlobal('indexedDB', new IDBFactory());
    vi.stubGlobal('structuredClone', (value: unknown) => value);
    remote = { version: 0, record: null };
    get = vi.spyOn(api, 'get').mockImplementation(() => Promise.resolve(remote));
    vi.spyOn(api, 'getBlob').mockResolvedValue(new Blob(['photo'], { type: 'image/jpeg' }));
    post = vi.spyOn(api, 'postMultipart').mockImplementation((_path, payload) => {
      const body = payload as { version: number; title: string; value: unknown; files: Array<{ name: string; lastModified: number }> };
      if (body.version !== remote.version) return Promise.reject(new Error('Alterado em outro dispositivo'));
      remote = { version: remote.version + 1, record: { title: body.title, value: body.value, updatedAt: new Date().toISOString(), files: body.files.map((file) => ({ ...file, mimeType: 'image/jpeg' })) } };
      return Promise.resolve({ version: remote.version });
    });
    remove = vi.spyOn(api, 'delete').mockImplementation(() => { remote = { version: remote.version + 1, record: null }; return Promise.resolve({ version: remote.version }); });
  });
  afterEach(() => { formDraftStore.setAccount(null); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  const save = (value: unknown) => formDraftStore.write({ key, title: 'Envio', updatedAt: new Date().toISOString(), version: 1, value });
  it('retoma campos, itens, fotos e idempotência mesmo com outro IndexedDB', async () => {
    await formDraftStore.read(key);
    const file = new File(['photo'], 'foto.jpg', { type: 'image/jpeg', lastModified: 10 });
    await save({ requestKey: 'same-operation', items: [{ quantity: 5, photos: [{ file, url: 'blob:local' }] }] });
    formDraftStore.setAccount(null); vi.stubGlobal('indexedDB', new IDBFactory()); formDraftStore.setAccount('account');
    const restored = (await formDraftStore.read(key))?.value as { requestKey: string; items: Array<{ quantity: number; photos: Array<{ file: File; url: string }> }> };
    expect(restored.requestKey).toBe('same-operation'); expect(restored.items[0].quantity).toBe(5);
    expect(restored.items[0].photos[0].file.name).toBe('foto.jpg'); expect(restored.items[0].photos[0].url).toBe('');
    await save({ ...restored, observation: 'Continuado no celular' });
    expect(post.mock.calls[1][2]).toEqual([]);
    expect(post.mock.calls[1][1]).toEqual(expect.objectContaining({ files: [expect.objectContaining({ reuseOrdinal: 0 })] }));
  });
  it('não sobrescreve outro dispositivo nem perde preenchimento local em conflito', async () => {
    await formDraftStore.read(key); await save({ observation: 'PC' });
    remote = { ...remote, version: remote.version + 1, record: { ...remote.record!, value: { observation: 'Celular' } } };
    await expect(save({ observation: 'PC não sincronizado' })).rejects.toThrow('outro dispositivo');
    const local = await formDraftStore.read(key);
    expect(local?.value).toEqual({ observation: 'PC não sincronizado' }); expect(local?.syncError).toContain('preservado');
    expect(remote.record?.value).toEqual({ observation: 'Celular' });
    expect((await formDraftStore.read(key, true))?.value).toEqual({ observation: 'Celular' });
  });
  it('tombstone evita recuperar cache antigo após conclusão em outro dispositivo', async () => {
    await formDraftStore.read(key); await save({ observation: 'Antigo' });
    remote = { version: remote.version + 1, record: null };
    expect(await formDraftStore.read(key)).toBeUndefined();
  });
  it('remove na conta e mantém uma cópia local quando falta conexão', async () => {
    await formDraftStore.read(key); await save({ observation: 'Parcial' });
    get.mockRejectedValueOnce(new Error('Sem conexão'));
    expect(await formDraftStore.read(key)).toMatchObject({ value: { observation: 'Parcial' }, syncError: 'Sem conexão' });
    await formDraftStore.read(key); await formDraftStore.removeTree(key);
    expect(remote.record).toBeNull(); expect(remove).toHaveBeenCalled();
  });
});
