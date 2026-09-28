// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProductForm } from './ProductForm';

describe('Gramatura no cadastro de produtos', () => {
  const props = { busy: false, onSave: (): Promise<void> => Promise.resolve(), onCancel: (): void => undefined };

  it('exibe gramatura obrigatoria para produto UN', () => {
    const html = renderToStaticMarkup(<ProductForm {...props} product={null} />);
    expect(html).toContain('Gramatura da unidade (g)');
    expect(html).toContain('name="unitWeightGrams"');
    expect(html).toContain('inputMode="numeric"');
  });

  it('carrega a gramatura cadastrada na edicao', () => {
    const html = renderToStaticMarkup(<ProductForm {...props} product={{ id: 'p', code: 'P1', name: 'Produto', defaultUnit: 'UN', unitWeightGrams: 350, shelfLifeYears: 3, active: true }} />);
    expect(html).toContain('value="350"');
  });

  it('nao exibe gramatura para fardo ou caixa', () => {
    const html = renderToStaticMarkup(<ProductForm {...props} product={{ id: 'cx', code: 'CX1', name: 'Caixa', defaultUnit: 'CX', unitsPerPackage: 12, unitProducts: [], shelfLifeYears: 3, active: true }} />);
    expect(html).not.toContain('name="unitWeightGrams"');
  });

  it('permite salvar embalagem vinculada sem preencher novamente a busca de unidade', () => {
    const unitProduct = { id: 'un', code: 'UN1', name: 'Unidade', defaultUnit: 'UN', shelfLifeYears: 3, active: true };
    const html = renderToStaticMarkup(<ProductForm {...props} product={{
      id: 'cx', code: 'CX1', name: 'Caixa', defaultUnit: 'CX', unitsPerPackage: 12,
      unitProducts: [unitProduct], shelfLifeYears: 3, active: true,
    }} />);
    const host = document.createElement('div');
    host.innerHTML = html;
    const form = host.querySelector('form')!;
    expect(Array.from(form.querySelectorAll<HTMLInputElement>('.product-autocomplete input')).every((input) => !input.required)).toBe(true);
    expect(form.checkValidity()).toBe(true);
    expect(form.querySelector<HTMLButtonElement>('button:last-child')?.disabled).toBe(false);
  });
});
