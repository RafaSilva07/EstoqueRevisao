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
    const html = renderToStaticMarkup(<ProductForm {...props} product={{ id: 'p', code: '123456', name: 'Produto', defaultUnit: 'UN', unitWeightGrams: 350, shelfLifeYears: 3, active: true }} />);
    expect(html).toContain('value="350"');
  });

  it('nao exibe gramatura para fardo ou caixa', () => {
    const html = renderToStaticMarkup(<ProductForm {...props} product={{ id: 'cx', code: '123456.78', name: 'Caixa', defaultUnit: 'CX', unitsPerPackage: 12, unitProducts: [], shelfLifeYears: 3, active: true }} />);
    expect(html).not.toContain('name="unitWeightGrams"');
  });

  it('permite salvar embalagem vinculada sem preencher novamente a busca de unidade', () => {
    const unitProduct = { id: 'un', code: '123457', name: 'Unidade', defaultUnit: 'UN', shelfLifeYears: 3, active: true };
    const html = renderToStaticMarkup(<ProductForm {...props} product={{
      id: 'cx', code: '123456.78', name: 'Caixa', defaultUnit: 'CX', unitsPerPackage: 12,
      unitProducts: [unitProduct], shelfLifeYears: 3, active: true,
    }} />);
    const host = document.createElement('div');
    host.innerHTML = html;
    const form = host.querySelector('form')!;
    expect(Array.from(form.querySelectorAll<HTMLInputElement>('.product-autocomplete input')).every((input) => !input.required)).toBe(true);
    expect(form.checkValidity()).toBe(true);
    expect(form.querySelector<HTMLButtonElement>('button:last-child')?.disabled).toBe(false);
  });

  it('orienta o formato obrigatório do código no formulário', () => {
    const html = renderToStaticMarkup(<ProductForm {...props} product={null} />);
    expect(html).toContain('pattern="[0-9]{6}([.][0-9]{2})?"');
    expect(html).toContain('maxLength="9"');
    expect(html).toContain('123456 ou 123456.78');
  });
});
