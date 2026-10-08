import { api } from './api';

export interface FormDraftRecord {
  key: string;
  title: string;
  updatedAt: string;
  version: 1;
  value: unknown;
  serverVersion?: number;
  pendingSync?: boolean;
  syncError?: string;
}

// Files are structured-cloned by IndexedDB; temporary preview URLs are not durable.
export function draftFingerprint(value: unknown): string {
  return JSON.stringify(value, (key, item: unknown) => {
    if (/^(password|token|accessToken|refreshToken|secret)$/i.test(key)) throw new Error('Dados sensíveis não podem ser salvos em rascunhos.');
    if (key === 'requestKey') return undefined;
    if (item instanceof File) return { name: item.name, size: item.size, type: item.type, lastModified: item.lastModified };
    if (key === 'url' && typeof item === 'string' && item.startsWith('blob:')) return undefined;
    return item;
  });
}

function previewFiles(value: unknown, urls: string[], restoring: boolean): unknown {
  if (value instanceof Blob || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item: unknown) => previewFiles(item, urls, restoring));
  const object = value as Record<string, unknown>;
  if (object.file instanceof File) {
    const url = restoring ? URL.createObjectURL(object.file) : '';
    if (url) urls.push(url);
    return { ...object, url };
  }
  return Object.fromEntries(Object.entries(object).map(([key, item]) => [key, previewFiles(item, urls, restoring)]));
}

export function restoreDraftFiles<T>(value: T, urls: string[]): T {
  return previewFiles(value, urls, true) as T;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('Este navegador não permite salvar rascunhos.')); return; }
    const request = indexedDB.open('estoque-revisao-form-drafts', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('forms', { keyPath: 'key' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Não foi possível abrir o armazenamento de rascunhos.'));
    request.onblocked = () => reject(new Error('Feche outras abas antigas para habilitar os rascunhos.'));
  });
}

async function transaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('forms', mode);
    let request: IDBRequest<T>;
    try { request = operation(tx.objectStore('forms')); }
    catch { database.close(); reject(new Error('Não foi possível guardar o rascunho neste navegador. Verifique o espaço disponível.')); return; }
    tx.oncomplete = () => { database.close(); resolve(request.result); };
    tx.onerror = tx.onabort = () => { database.close(); reject(new Error('Não foi possível salvar o rascunho. Verifique o espaço e as permissões do navegador.')); };
  });
}

let pendingMutation = Promise.resolve();
let accountId: string | null = null;
const serverVersions = new Map<string, number>();
const savedFiles = new Map<string, Map<File, number>>();
function cloudPath(key: string): string | null {
  const [owner, mode, ...form] = key.split(':');
  return owner === accountId ? `/form-drafts/${encodeURIComponent(form.join(':'))}?mode=${mode}` : null;
}
function encodeFiles(value: unknown, files: File[]): unknown {
  if (value instanceof File) { const index = files.push(value) - 1; return { __draftFile: index }; }
  if (Array.isArray(value)) return value.map((item: unknown) => encodeFiles(item, files));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === 'url' && typeof item === 'string' && item.startsWith('blob:') ? '' : encodeFiles(item, files)]));
  return value;
}
function decodeFiles(value: unknown, files: File[]): unknown {
  if (Array.isArray(value)) return value.map((item: unknown) => decodeFiles(item, files));
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    if (typeof object.__draftFile === 'number') {
      const file = files[object.__draftFile]; if (!file) throw new Error('Foto do rascunho incompleta.'); return file;
    }
    return Object.fromEntries(Object.entries(object).map(([key, item]) => [key, decodeFiles(item, files)]));
  }
  return value;
}
function mutate(action: () => Promise<void>): Promise<void> {
  const pending = pendingMutation.catch(() => undefined).then(action);
  pendingMutation = pending;
  return pending;
}

export const formDraftStore = {
  setAccount(id: string | null) { if (accountId !== id) { serverVersions.clear(); savedFiles.clear(); } accountId = id; },
  isCloud(key: string) { return Boolean(cloudPath(key)); },
  async read(key: string, useRemote = false): Promise<FormDraftRecord | undefined> {
    await pendingMutation.catch(() => undefined);
    const local = await transaction('readonly', (store) => store.get(key) as IDBRequest<FormDraftRecord | undefined>).catch(() => undefined);
    const path = cloudPath(key); if (!path) return local;
    try {
      const remote = await api.get<{ version: number; record: { title: string; updatedAt: string; value: unknown; files: Array<{ name: string; lastModified: number; mimeType: string }> } | null }>(path);
      if (!Number.isInteger(remote.version) || remote.record === undefined) throw new Error('Não foi possível consultar o rascunho da conta.');
      serverVersions.set(key, remote.version);
      if (!useRemote && local?.pendingSync) {
        if (local.serverVersion === remote.version) return local;
        serverVersions.delete(key);
        return { ...local, syncError: 'Outro dispositivo alterou este rascunho. Seu preenchimento local foi preservado. Use “Carregar versão da conta” para escolher a versão sincronizada.' };
      }
      if (!remote.record) {
        if (remote.version === 0 && local && local.serverVersion === undefined) return local;
        await transaction('readwrite', (store) => store.delete(key)).catch(() => undefined); return undefined;
      }
      const record = remote.record;
      const files: File[] = [];
      const [base, query] = path.split('?');
      for (const [index, photo] of record.files.entries()) {
        const blob = await api.getBlob(`${base}/photos/${index}?${query}&version=${remote.version}`);
        files.push(new File([blob], photo.name, { type: photo.mimeType, lastModified: photo.lastModified }));
      }
      savedFiles.set(key, new Map(files.map((file, index) => [file, index])));
      const result: FormDraftRecord = { key, title: record.title, updatedAt: record.updatedAt, version: 1, serverVersion: remote.version, value: decodeFiles(record.value, files) };
      await transaction('readwrite', (store) => store.put(result)).catch(() => undefined);
      return result;
    } catch (caught) {
      serverVersions.delete(key);
      if (local) return { ...local, syncError: caught instanceof Error ? caught.message : 'Sem conexão com os rascunhos da conta.' };
      throw caught;
    }
  },
  async write(record: FormDraftRecord): Promise<void> {
    draftFingerprint(record.value);
    await mutate(async () => {
      const path = cloudPath(record.key); const version = serverVersions.get(record.key);
      const cached = { ...record, value: previewFiles(record.value, [], false), ...(path ? { serverVersion: version, pendingSync: true } : {}) };
      await transaction('readwrite', (store) => store.put(cached)).catch((error: unknown) => { if (!path) throw error; });
      if (!path) return;
      if (version === undefined) throw new Error('Não foi possível consultar a versão da conta. Seu preenchimento foi mantido neste navegador; reabra o formulário com conexão.');
      const files: File[] = []; const value = encodeFiles(record.value, files);
      const previous = savedFiles.get(record.key);
      const result = await api.postMultipart<{ version: number }>(path, { version, title: record.title, value, files: files.map((file) => ({ name: file.name, lastModified: file.lastModified, reuseOrdinal: previous?.get(file) })) }, files.filter((file) => previous?.get(file) === undefined));
      if (result.version !== version + 1) throw new Error('Não foi possível confirmar o salvamento na conta.');
      serverVersions.set(record.key, result.version);
      savedFiles.set(record.key, new Map(files.map((file, index) => [file, index])));
      await transaction('readwrite', (store) => store.put({ ...cached, pendingSync: false, serverVersion: result.version })).catch(() => undefined);
    });
  },
  async removeTree(key: string): Promise<void> {
    await mutate(async () => {
      const path = cloudPath(key);
      if (path) {
        const version = serverVersions.get(key); if (version === undefined) throw new Error('Não foi possível confirmar a versão do rascunho.');
        const result = await api.delete<{ version: number }>(`${path}&version=${version}`);
        serverVersions.set(key, result.version);
      }
      savedFiles.delete(key);
      const keys = await transaction('readonly', (store) => store.getAllKeys()).catch((error: unknown) => { if (!path) throw error; return []; });
      await Promise.all(keys.filter((candidate) => typeof candidate === 'string' && (candidate === key || candidate.startsWith(`${key}:`))).map((candidate) => transaction('readwrite', (store) => store.delete(candidate))));
    });
  },
};
