export interface FormDraftRecord {
  key: string;
  title: string;
  updatedAt: string;
  version: 1;
  value: unknown;
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
function mutate(action: () => Promise<void>): Promise<void> {
  const pending = pendingMutation.catch(() => undefined).then(action);
  pendingMutation = pending;
  return pending;
}

export const formDraftStore = {
  async read(key: string): Promise<FormDraftRecord | undefined> {
    await pendingMutation.catch(() => undefined);
    return await transaction('readonly', (store) => store.get(key) as IDBRequest<FormDraftRecord | undefined>);
  },
  async write(record: FormDraftRecord): Promise<void> {
    draftFingerprint(record.value);
    await mutate(async () => { await transaction('readwrite', (store) => store.put({ ...record, value: previewFiles(record.value, [], false) })); });
  },
  async removeTree(key: string): Promise<void> {
    await mutate(async () => {
      const keys = await transaction('readonly', (store) => store.getAllKeys());
      await Promise.all(keys.filter((candidate) => typeof candidate === 'string' && (candidate === key || candidate.startsWith(`${key}:`))).map((candidate) => transaction('readwrite', (store) => store.delete(candidate))));
    });
  },
};
