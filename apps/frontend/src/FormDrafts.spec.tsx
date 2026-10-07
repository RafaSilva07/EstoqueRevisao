// @vitest-environment jsdom
import { act, useLayoutEffect, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DraftActions, FormDraftProvider } from './FormDrafts';
import { useDraftWorkspace } from './draft-context';
import { useFormDraft } from './useFormDraft';
import { draftFingerprint, formDraftStore } from './form-draft-store';
import { Modal } from './components';
import { NewShipment } from './NewShipment';
import { api, Product } from './api';
import { emptyLot } from './operational-lot';
import { UsersPage } from './UsersPage';

interface Value { observation: string; items: string[]; photos: { file: File; url: string }[]; requestKey: string }
const initial: Value = { observation: '', items: [], photos: [], requestKey: 'idempotency-key' };
let host: HTMLDivElement; let root: Root;
let current: ReturnType<typeof useFormDraft<Value>>;
const done = vi.fn();

function cloneBrowserValue(value: unknown): unknown {
  if (value instanceof File) return new File([value], value.name, { type: value.type, lastModified: value.lastModified });
  if (Array.isArray(value)) return value.map((item: unknown) => cloneBrowserValue(item));
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]: [string, unknown]) => [key, cloneBrowserValue(item)]));
  return value;
}

function Form({ busy = false, reusable = false, modal = false }: { busy?: boolean; reusable?: boolean; modal?: boolean }) {
  const [value, setValue] = useState(initial);
  const draft = useFormDraft('entry', 'Entrada externa', value, setValue, { busy, reusable });
  useLayoutEffect(() => { current = draft; });
  if (!draft.ready) return <p>Recuperando</p>;
  const content = <><DraftActions draft={draft} /><input aria-label="Observação" value={value.observation} onChange={(event) => setValue({ ...value, observation: event.target.value })} />
    <span data-testid="items">{value.items.join(',')}</span><span data-testid="key">{value.requestKey}</span>
    <span data-testid="photos">{value.photos.map((photo) => `${photo.file.name}:${photo.url}`).join(',')}</span>
    <button onClick={() => draft.close(done)}>Voltar</button><button onClick={() => setValue({ ...value, items: ['Produto A'] })}>Adicionar</button>
    <button onClick={() => void draft.complete()}>Concluir</button></>;
  return modal ? <Modal labelledBy="form-title" onClose={() => draft.close(done)}><h2 id="form-title">Preenchimento</h2>{content}</Modal> : content;
}
function Scope({ scope, children }: { scope: string; children: React.ReactNode }) {
  const workspace = useDraftWorkspace(); const setScope = workspace?.setScope;
  useLayoutEffect(() => { setScope?.(scope); }, [scope, setScope]);
  return children;
}
async function until(predicate: () => boolean) {
  for (let index = 0; index < 80; index++) { if (predicate()) return; await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); }); }
  expect(predicate()).toBe(true);
}
async function render(scope = 'user:REVISAO', busy = false, reusable = false, modal = false) {
  await act(async () => { root.render(<FormDraftProvider><Scope scope={scope}><Form key={scope} busy={busy} reusable={reusable} modal={modal} /></Scope></FormDraftProvider>); await Promise.resolve(); });
  await until(() => Boolean(host.querySelector('input')));
}
async function type(text: string) {
  const input = host.querySelector('input')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text); input.dispatchEvent(new Event('input', { bubbles: true })); await Promise.resolve(); });
}
async function click(text: string) {
  const button = Array.from(document.querySelectorAll('button')).find((item) => item.textContent === text)!;
  expect(button).toBeTruthy(); await act(async () => { button.click(); await Promise.resolve(); });
}

describe('rascunhos dos formulários', () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.stubGlobal('indexedDB', new IDBFactory());
    // Node's structuredClone does not preserve browser File objects. Emulate the browser here.
    vi.stubGlobal('structuredClone', cloneBrowserValue);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn().mockReturnValue('blob:restored') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
    host = document.createElement('div'); document.body.append(host); root = createRoot(host); done.mockReset();
  });
  afterEach(async () => { await act(async () => { root.unmount(); await Promise.resolve(); }); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('salva automaticamente dados incompletos sem confirmar uma operação', async () => {
    await render(); await type('Ainda preenchendo');
    await until(() => host.textContent?.includes('Rascunho salvo neste navegador.') ?? false);
    const saved = await formDraftStore.read('user:REVISAO:entry');
    expect(saved?.value).toEqual({ ...initial, observation: 'Ainda preenchendo' }); expect(done).not.toHaveBeenCalled();
  });
  it('recupera itens, campos, fotos e a chave de idempotência', async () => {
    const file = new File(['photo'], 'evidencia.jpg', { type: 'image/jpeg', lastModified: 10 });
    await formDraftStore.write({ key: 'user:REVISAO:entry', title: 'Entrada', version: 1, updatedAt: '2026-10-06', value: { ...initial, observation: 'Retomar', items: ['Produto B'], requestKey: 'same-key', photos: [{ file, url: 'blob:old' }] } });
    await render(); expect(host.querySelector('input')?.value).toBe('Retomar'); expect(host.querySelector('[data-testid=items]')?.textContent).toBe('Produto B');
    expect(host.querySelector('[data-testid=key]')?.textContent).toBe('same-key'); expect(host.querySelector('[data-testid=photos]')?.textContent).toBe('evidencia.jpg:blob:restored');
    const stored = await formDraftStore.read('user:REVISAO:entry'); expect(draftFingerprint(stored?.value)).not.toContain('blob:old');
  });
  it('isola rascunhos por usuário e modo operacional', async () => {
    await render(); await type('Privado'); await act(async () => { await current.save(); });
    await render('other:REVISAO'); expect(host.querySelector('input')?.value).toBe('');
    await render('user:PCP'); expect(host.querySelector('input')?.value).toBe('');
    await render(); expect(host.querySelector('input')?.value).toBe('Privado');
  });
  it('permite continuar, salvar e sair ou descartar antes de fechar', async () => {
    await render(); await type('Parcial'); await click('Voltar'); expect(document.body.textContent).toContain('Guardar o preenchimento?');
    await click('Continuar preenchendo'); expect(done).not.toHaveBeenCalled(); expect(host.querySelector('input')?.value).toBe('Parcial');
    await click('Voltar'); await click('Salvar rascunho e sair'); await until(() => done.mock.calls.length === 1);
    expect((await formDraftStore.read('user:REVISAO:entry'))?.value).toEqual({ ...initial, observation: 'Parcial' });
    await click('Voltar'); await click('Descartar e sair'); await until(() => done.mock.calls.length === 2);
    expect(await formDraftStore.read('user:REVISAO:entry')).toBeUndefined(); expect(host.querySelector('input')?.value).toBe('');
    await type('Novo preenchimento'); await act(async () => { await current.save(); }); expect((await formDraftStore.read('user:REVISAO:entry'))?.value).toEqual({ ...initial, observation: 'Novo preenchimento' });
  });
  it('não deixa sair se a gravação falhar e mantém o preenchimento', async () => {
    await render(); await type('Não perder'); vi.spyOn(formDraftStore, 'write').mockRejectedValue(new Error('Armazenamento cheio'));
    await click('Voltar'); await click('Salvar rascunho e sair'); await until(() => document.body.textContent?.includes('Armazenamento cheio') ?? false);
    expect(done).not.toHaveBeenCalled(); expect(host.querySelector('input')?.value).toBe('Não perder');
  });
  it('não recupera conteúdo antigo depois de voltar os campos aos valores iniciais', async () => {
    await render(); await type('Conteúdo removido'); await act(async () => { await current.save(); }); await type('');
    await click('Voltar'); await click('Salvar rascunho e sair'); await until(() => done.mock.calls.length === 1);
    expect((await formDraftStore.read('user:REVISAO:entry'))?.value).toEqual(initial);
  });
  it('não abre confirmação vazia e bloqueia saída durante submissão', async () => {
    await render(); await click('Voltar'); expect(done).toHaveBeenCalledOnce(); done.mockClear();
    await render('user:REVISAO', true); await click('Voltar'); expect(done).not.toHaveBeenCalled(); expect(document.body.textContent).toContain('Aguarde a operação');
  });
  it('limpa após sucesso e permite novo preenchimento em formulários reutilizáveis', async () => {
    await render('user:REVISAO', false, true); await type('Enviar'); await act(async () => { await current.save(); await current.complete(); });
    expect(await formDraftStore.read('user:REVISAO:entry')).toBeUndefined(); await click('Voltar'); expect(done).toHaveBeenCalledOnce();
    await type('Outra alteração'); await act(async () => { await current.save(); }); expect((await formDraftStore.read('user:REVISAO:entry'))?.value).toEqual({ ...initial, observation: 'Outra alteração' });
  });
  it('não grava senhas ou tokens', async () => {
    for (const key of ['password', 'accessToken', 'refreshToken', 'token', 'secret']) await expect(formDraftStore.write({ key: 'unsafe', title: 'Teste', version: 1, updatedAt: '', value: { [key]: 'private' } })).rejects.toThrow('Dados sensíveis');
    expect(await formDraftStore.read('unsafe')).toBeUndefined();
  });
  it('remove também um editor interno já fechado, sem apagar outro formulário', async () => {
    for (const key of ['user:REVISAO:entry', 'user:REVISAO:entry:editor', 'user:REVISAO:exit']) await formDraftStore.write({ key, title: 'Teste', version: 1, updatedAt: '', value: initial });
    await formDraftStore.removeTree('user:REVISAO:entry'); expect(await formDraftStore.read('user:REVISAO:entry:editor')).toBeUndefined(); expect(await formDraftStore.read('user:REVISAO:exit')).toBeDefined();
  });
  it('pergunta ao clicar fora ou usar Escape e mantém o formulário de fundo inativo', async () => {
    await render('user:REVISAO', false, false, true); await type('Dentro do modal');
    await act(async () => { host.querySelector('.dialog-backdrop')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); await Promise.resolve(); });
    expect(document.body.textContent).toContain('Guardar o preenchimento?'); expect(host.querySelector('.draft-content')?.hasAttribute('inert')).toBe(true);
    await click('Continuar preenchendo');
    await act(async () => { host.querySelector('[role=dialog]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await Promise.resolve(); });
    expect(document.body.textContent).toContain('Guardar o preenchimento?'); expect(done).not.toHaveBeenCalled();
  });
  it('pede confirmação nativa ao atualizar a aba com preenchimento e tenta gravar o último campo', async () => {
    await render(); await type('Último campo');
    const event = new Event('beforeunload', { cancelable: true });
    await act(async () => { window.dispatchEvent(event); await Promise.resolve(); });
    expect(event.defaultPrevented).toBe(true); await act(async () => { await current.save(); });
    expect((await formDraftStore.read('user:REVISAO:entry'))?.value).toEqual({ ...initial, observation: 'Último campo' });
  });
  it('permite sair após sucesso mesmo que o estado busy ainda esteja ativo', async () => {
    await render('user:REVISAO', true); await type('Concluído'); await act(async () => { await current.complete(); });
    await click('Voltar'); expect(done).toHaveBeenCalledOnce();
  });
  it('retoma um envio com foto, preserva em erro e limpa somente depois do sucesso da API', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ minimum: 1, maximum: 5 });
    const post = vi.spyOn(api, 'postMultipart').mockRejectedValueOnce(new Error('Falha no envio')).mockResolvedValueOnce({ id: 'shipment-created' });
    const product: Product = { id: 'product', code: '005601.90', name: 'Produto UN', defaultUnit: 'UN', active: true };
    const snapshot = { destination: 'REVISAO', positionPage: 1, loadingStatus: '', vehiclePlate: '', assemblyMode: false, product: null, positionId: '', batchCode: '', manufacturingDate: '', quantity: '', itemObservation: '', observation: 'Continuar depois', lot: emptyLot, ready: false, requestKey: 'd0169645-4fb1-40cb-b101-21dc42efb473', productQuery: { code: '', name: '' },
      items: [{ key: 'item', product, quantity: 10, observation: null, lot: { code: 'CICINV', manufacturingDate: '2026-09-09', expirationDate: '2029-09-09' }, photos: [{ file: new File(['photo'], 'evidencia.jpg', { type: 'image/jpeg' }), url: 'blob:old' }] }] };
    const key = 'user:PRODUCAO:shipment:PRODUCAO';
    await formDraftStore.write({ key, title: 'Envio', version: 1, updatedAt: '', value: snapshot });
    await act(async () => { root.render(<FormDraftProvider><Scope scope="user:PRODUCAO"><NewShipment sector="PRODUCAO" onCreated={done} onClose={() => undefined} /></Scope></FormDraftProvider>); await Promise.resolve(); });
    await until(() => host.textContent?.includes('Produtos (1)') ?? false);
    await click('Conferir e enviar'); await click('Enviar ao destinatário');
    await until(() => host.textContent?.includes('Falha no envio') ?? false);
    expect(done).not.toHaveBeenCalled(); expect(await formDraftStore.read(key)).toBeDefined();
    expect(post.mock.calls[0][1]).toEqual(expect.objectContaining({ requestKey: snapshot.requestKey, items: [expect.objectContaining({ productId: 'product', quantity: 10, photoCount: 1 })] }));
    expect(post.mock.calls[0][2]?.[0].name).toBe('evidencia.jpg');
    await click('Enviar ao destinatário'); await until(() => done.mock.calls.length === 1);
    expect(await formDraftStore.read(key)).toBeUndefined(); expect(post.mock.calls[1][1]).toEqual(post.mock.calls[0][1]);
  });
  it('retoma o editor de produto ainda incompleto e mantém os campos ao salvar e fechar', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ minimum: 1, maximum: 5 });
    const resolve = vi.spyOn(api, 'post').mockResolvedValue({ code: 'CICINV', manufacturingDate: '2026-09-09', suggestedExpirationDate: '2029-09-09' });
    const product: Product = { id: 'product', code: '005601.90', name: 'Produto UN', defaultUnit: 'UN', active: true };
    const snapshot = { destination: 'REVISAO', positionPage: 1, loadingStatus: '', vehiclePlate: '', assemblyMode: false, product, positionId: '', batchCode: '', manufacturingDate: '', quantity: '4', itemObservation: 'Conferir', observation: '', lot: { ...emptyLot, code: 'CICINV' }, ready: false, requestKey: 'd0169645-4fb1-40cb-b101-21dc42efb473', productQuery: { code: product.code, name: product.name }, items: [] };
    await formDraftStore.write({ key: 'user:PRODUCAO:shipment:PRODUCAO', title: 'Envio', version: 1, updatedAt: '', value: snapshot });
    await act(async () => { root.render(<FormDraftProvider><Scope scope="user:PRODUCAO"><NewShipment sector="PRODUCAO" onCreated={done} onClose={() => undefined} /></Scope></FormDraftProvider>); await Promise.resolve(); });
    await until(() => host.textContent?.includes('Produtos (0)') ?? false); await click('Adicionar produto');
    const modal = host.querySelector('[role=dialog]')!;
    expect(modal.querySelector<HTMLInputElement>('input[type=number]')?.value).toBe('4');
    const input = [...modal.querySelectorAll('input')].find((item) => item.closest('label')?.textContent?.includes('Lote CONSERVADI'))!;
    await act(async () => { input.focus(); input.blur(); await Promise.resolve(); });
    expect(resolve).toHaveBeenCalledExactlyOnceWith('/shipments/resolve-lot', { productId: 'product', code: 'CICINV' });
    await click('Cancelar'); await click('Salvar rascunho e sair'); await until(() => !host.querySelector('[role=dialog]'));
    await click('Adicionar produto'); expect(host.querySelector<HTMLInputElement>('input[type=number]')?.value).toBe('4');
    expect(done).not.toHaveBeenCalled();
  });
  it('recupera um cadastro de usuário, mas exige digitar a senha novamente', async () => {
    vi.spyOn(api, 'get').mockImplementation((path) => Promise.resolve(path === '/users/roles' ? [{ code: 'REVISAO', name: 'Revisão', editable: true, version: 1, userCount: 0, modes: ['REVISAO'], permissionCodes: [] }]
      : path === '/users/permissions' ? [] : { items: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } }));
    const key = 'administrator:ADMIN:user:new';
    await formDraftStore.write({ key, title: 'Usuário', version: 1, updatedAt: '', value: { username: 'operador', status: 'ACTIVE', selectedRoles: ['REVISAO'], selectedPermissions: [], sector: 'REVISAO', applyPreset: false, passwordEntered: false } });
    await act(async () => { root.render(<FormDraftProvider><Scope scope="administrator:ADMIN"><UsersPage currentUserId="administrator" onOwnUpdate={() => undefined} /></Scope></FormDraftProvider>); await Promise.resolve(); });
    await until(() => [...host.querySelectorAll('button')].some((button) => button.textContent === 'Novo usuário' && !button.disabled)); await click('Novo usuário');
    await until(() => host.querySelector<HTMLInputElement>('input[name=username]')?.value === 'operador');
    const password = host.querySelector<HTMLInputElement>('input[name=password]')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(password, 'never-store-this'); password.dispatchEvent(new Event('input', { bubbles: true })); await Promise.resolve(); });
    await click('Salvar rascunho');
    await act(async () => { expect(JSON.stringify((await formDraftStore.read(key))?.value)).not.toContain('never-store-this'); });
    await click('Voltar'); await click('Salvar rascunho e sair'); await until(() => !host.querySelector('[role=dialog]'));
    await click('Novo usuário'); await until(() => host.querySelector<HTMLInputElement>('input[name=username]')?.value === 'operador');
    expect(host.querySelector<HTMLInputElement>('input[name=password]')?.value).toBe(''); expect(host.querySelector<HTMLInputElement>('input[name=password]')?.required).toBe(true);
  });
});
