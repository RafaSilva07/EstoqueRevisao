// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { TourId } from './help-tours';
import { resolveTourHint, type TourView } from './tour-hints';

function controls(html: string, state?: Partial<Pick<TourView, 'focused' | 'dialog' | 'reviewed'>>) {
  const host = document.createElement('div');
  host.innerHTML = html;
  return {
    find: (target: string) => host.querySelector<HTMLElement>(`[data-tour="${target}"]`) ?? undefined,
    focused: undefined,
    dialog: null,
    reviewed: () => false,
    ...state,
  };
}

function target(id: TourId, ...args: Parameters<typeof controls>) {
  return resolveTourHint(id, controls(...args))?.target;
}

describe('orientações acompanham os controles das operações', () => {
  it('passa do cadastro aos campos, validações e ao vínculo de um fardo', () => {
    expect(target('review-product-create', '<button data-tour="product-new"></button>')).toBe('product-new');
    const form = '<form data-tour="product-form"><input data-tour="product-code" value="123456" pattern="[0-9]{6}"><input data-tour="product-name" value="Produto">';
    const base = form + '<select data-tour="product-unit"><option value="FD"></option></select><input data-tour="product-life" value="2"><input data-tour="product-package-size" value="12">';
    const dialog = { dialog: 'product-form-title' };
    expect(target('review-product-create', form, { ...dialog, focused: 'product-code' })).toBe('product-code');
    expect(target('review-product-create', base + '<button data-tour="product-package-link" disabled></button>', dialog)).toBe('product-package-search');
    expect(target('review-product-create', base + '<button data-tour="product-package-link"></button>', dialog)).toBe('product-package-link');
    expect(target('review-product-create', base + '<p data-tour="product-linked"></p>', dialog)).toBe('product-save');
    expect(resolveTourHint('review-product-create', controls('', { dialog: 'product-form-title' }))).toBeUndefined();
  });

  it('usa saldo e distribuição da revisão e explica quando não há lote', () => {
    const dialog = { dialog: 'review-item-title' };
    expect(target('review-stock', '<div data-tour="review-empty"></div>', dialog)).toBe('review-empty');
    expect(target('review-stock', '<button data-tour="review-lot" data-tour-ready="true"></button>', dialog)).toBe('review-select');
    const editor = '<input data-tour="review-quantity" type="number" value="3"><select data-tour="review-output"><option value="">Selecione</option><option value="un" selected>UN</option></select>';
    expect(target('review-stock', editor + '<button data-tour="review-save-item" disabled></button>', dialog)).toBe('review-distribution');
    expect(target('review-stock', editor + '<button data-tour="review-save-item"></button>', dialog)).toBe('review-save-item');
    expect(target('review-stock', '', { dialog: 'review-confirm-title' })).toBe('review-confirm');
  });

  it('guia recebimento integral, separação imediata, conflito e recusa', () => {
    const dialog = { dialog: 'shipment-decision-title' };
    const radio = '<input type="radio" data-tour="receipt-separation">';
    const confirm = '<button data-tour="receipt-submit" data-tour-choice="separate"></button>';
    expect(target('review-receive', radio + confirm, dialog)).toBe('receipt-separation');
    expect(target('review-receive', radio + confirm, { ...dialog, reviewed: () => true })).toBe('receipt-submit');
    expect(target('review-receive', radio + confirm.replace('separate', 'conflict'), dialog)).toBe('receipt-submit');
    expect(target('review-receive', '<button data-tour="separation-photo"></button><button data-tour="separation-confirm"></button>', { dialog: 'separation-title' })).toBe('separation-photo');
    expect(target('expedition-receive', '<button data-tour="receipt-submit"></button>', dialog)).toBe('receipt-submit');
    expect(target('expedition-receive', '<textarea data-tour="receipt-reason" required></textarea>', dialog)).toBe('receipt-reason');
    expect(resolveTourHint('review-receive', controls('<button data-tour="receipt-search"></button><button data-tour="receipt-tab-pending" aria-pressed="true"></button><p data-tour="receipt-empty"></p>'))?.title).toBe('Nenhum envio nesta consulta');
  });

  it('guia montagem em várias posições e envio carregado com lote e fotos', () => {
    const source = '<select data-tour="assembly-package"><option value="fd">FD</option></select><div data-tour="assembly-positions" data-tour-ready="true"></div><input data-tour="assembly-quantity" value="2"><input data-tour="assembly-share"><button data-tour="assembly-add"></button>';
    const dialog = { dialog: 'add-product-title', reviewed: () => true };
    expect(target('review-assembly', '<input data-tour="assembly-unit">' + source, dialog)).toBe('assembly-share');
    expect(target('review-assembly', '<select data-tour="shipment-destination"><option value="EXPEDICAO">Expedição</option></select><input data-tour="shipment-assembly" type="checkbox">')).toBe('shipment-assembly');
    const loading = '<select data-tour="shipment-loading"><option value="CARREGADO">Carregado</option></select>';
    expect(target('expedition-send', loading + '<input data-tour="shipment-plate" required>')).toBe('shipment-plate');
    expect(target('expedition-send', loading + '<button data-tour="shipment-photo"></button>')).toBe('shipment-photo');
    expect(target('expedition-send', '<div data-tour="shipment-product-selected"></div><input data-tour="shipment-lot"><button data-tour="shipment-add-item" disabled></button>', dialog)).toBe('shipment-lot');
    expect(target('expedition-send', '', { dialog: 'shipment-summary-title' })).toBe('shipment-confirm');
  });
});
