import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProductAutocomplete } from './ProductAutocomplete';
import { Product } from './api';
import { filterAvailableProducts } from './product-search';

describe('Busca de produto do envio', () => {
  it('oferece código e descrição como campos de busca sincronizados', () => {
    const html = renderToStaticMarkup(<ProductAutocomplete onChange={() => undefined} />);
    expect(html).toContain('Código *');
    expect(html).toContain('Descrição *');
    expect(html).toContain('Digite ou abra a lista');
    expect(html).toContain('Digite o nome do produto');
    expect(html.match(/role="combobox"/g)).toHaveLength(2);
    expect(html).toContain('Abrir lista de códigos');
    expect(html).toContain('Abrir lista de descrições');
    expect(html).not.toContain('<select');
  });
  it('filtra a lista disponível conforme código ou nome digitado', () => {
    const products: Product[] = [
      { id: '1', code: '001', name: 'Molho Tradicional', defaultUnit: 'UN', active: true },
      { id: '2', code: '002', name: 'Molho Picante', defaultUnit: 'UN', active: true },
      { id: '3', code: 'ABC', name: 'Conserva', defaultUnit: 'UN', active: true },
    ];
    expect(filterAvailableProducts(products, 'code', '00').map((product) => product.id)).toEqual(['1', '2']);
    expect(filterAvailableProducts(products, 'name', 'pic').map((product) => product.id)).toEqual(['2']);
  });
  it('encontra palavras livres no nome em qualquer ordem, sem distinguir caixa ou acento', () => {
    const products: Product[] = [
      { id: '1', code: '760001', name: 'MILHO VERDE PANAMÁ', defaultUnit: 'UN', active: true },
      { id: '2', code: '760002', name: 'MILHO VERDE SEM MARCA', defaultUnit: 'UN', active: true },
      { id: '3', code: '760003', name: 'ERVILHA PANAMÁ', defaultUnit: 'UN', active: true },
    ];
    expect(filterAvailableProducts(products, 'name', 'panama').map((product) => product.id)).toEqual(['1', '3']);
    expect(filterAvailableProducts(products, 'name', ' PANAMA   verde ').map((product) => product.id)).toEqual(['1']);
    expect(filterAvailableProducts(products, 'name', 'panama inexistente')).toEqual([]);
  });
  it('encontra PETITOSA mesmo omitindo LEG e usando apenas o trecho petito', () => {
    const products: Product[] = ['003375.00', '003375.10', '003375.20', '003375.90', '003375.94'].map((code) => ({ id: code, code, name: 'SEL LEG PETITOSA 24/170', defaultUnit: 'UN', active: true }));
    expect(filterAvailableProducts(products, 'name', 'sel petito').map((product) => product.code)).toEqual(products.map((product) => product.code));
    expect(filterAvailableProducts(products, 'name', 'petito sel')).toHaveLength(5);
  });
});
