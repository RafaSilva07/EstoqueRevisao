// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserSession } from './api';
import { HelpMenu } from './HelpMenu';
import { availableHelpTours } from './help-tours';
import { userForOperationalMode } from './operational-mode';

const reviewer: UserSession = {
  id: 'reviewer', username: 'revisao', sector: 'REVISAO', roles: ['REVISAO'],
  permissions: ['products.read', 'products.create', 'shipments.read', 'shipments.decide', 'shipments.create', 'movements.review'],
};

describe('tours disponíveis por modo operacional e permissão', () => {
  it('mostra os quatro fluxos de Revisão e esconde ações sem permissão efetiva', () => {
    expect(availableHelpTours(reviewer, 'REVISAO').map(({ id }) => id)).toEqual([
      'review-product-create', 'review-receive', 'review-stock', 'review-assembly',
    ]);
    expect(availableHelpTours({ ...reviewer, permissions: ['products.read', 'shipments.create', 'shipments.decide'] }, 'REVISAO')).toEqual([]);
  });

  it('usa o modo selecionado para a conta com acesso aos dois setores', () => {
    const admin: UserSession = { ...reviewer, roles: ['ADMIN_REVISAO_EXPEDICAO'] };
    const expedition = userForOperationalMode(admin, 'EXPEDICAO');
    expect(availableHelpTours(expedition, 'EXPEDICAO').map(({ id }) => id)).toEqual([
      'expedition-send', 'expedition-receive',
    ]);
    expect(availableHelpTours(expedition, 'REVISAO')).toEqual([]);
    expect(availableHelpTours(reviewer, 'ADMIN')).toEqual([]);
    expect(availableHelpTours(reviewer, 'PCP')).toEqual([]);
    expect(availableHelpTours(reviewer, 'PRODUCAO')).toEqual([]);
  });
});

describe('menu de ajuda', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  function clickButton(label: string) {
    const button = Array.from(host.querySelectorAll('button')).find((candidate) => candidate.textContent?.trim() === label);
    if (!button) throw new Error(`Botão ausente: ${label}`);
    button.focus();
    act(() => button.click());
    return button;
  }

  it('navega, retoma o passo, move o foco e fecha com Escape', () => {
    const navigate = vi.fn();
    act(() => root.render(<HelpMenu user={reviewer} mode="REVISAO" page="home" navigate={navigate} />));

    const trigger = clickButton('Ajuda');
    expect(document.activeElement?.textContent).toBe('Ajuda');
    clickButton('Cadastrar produto');
    expect(document.activeElement?.textContent).toBe('Abra o cadastro');
    clickButton('Próximo passo');
    expect(document.activeElement?.textContent).toBe('Preencha os dados do produto');
    clickButton('Abrir Produtos');
    expect(navigate).toHaveBeenCalledExactlyOnceWith('products');
    expect(host.querySelector('[role="dialog"]')).toBeNull();

    act(() => root.render(<HelpMenu user={reviewer} mode="REVISAO" page="products" navigate={navigate} />));
    clickButton('Ajuda');
    clickButton('Continuar tour de cadastrar produto');
    expect(host.textContent).toContain('Passo 2 de 3');
    clickButton('Voltar à operação');
    expect(navigate).toHaveBeenCalledTimes(1);
    clickButton('Ajuda');
    clickButton('Continuar tour de cadastrar produto');
    clickButton('Anterior');
    expect(document.activeElement?.textContent).toBe('Abra o cadastro');
    clickButton('Próximo passo');
    clickButton('Próximo passo');
    clickButton('Concluir tour');
    expect(host.textContent).not.toContain('Continuar tour');
    act(() => { document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('exibe o rascunho educacional e as fontes mesmo sem tours disponíveis', () => {
    const navigate = vi.fn();
    act(() => root.render(<HelpMenu user={{ ...reviewer, sector: 'PCP' }} mode="PCP" page="home" navigate={navigate} />));
    clickButton('Ajuda');
    expect(host.textContent).toContain('Não há tours disponíveis');
    clickButton('Termos de uso');
    expect(document.activeElement?.textContent).toBe('Termos de uso');
    expect(host.textContent).toContain('Rascunho educacional · versão 0.1');
    expect(host.textContent).toContain('Elaboração: Rafael Silva e João Victor Fernandes');
    expect(host.textContent).toContain('Responsável pela revisão');
    expect(host.textContent).toContain('Dúvidas pendentes');
    expect(host.querySelectorAll('.help-terms a')).toHaveLength(3);
    expect(navigate).not.toHaveBeenCalled();
  });
});
