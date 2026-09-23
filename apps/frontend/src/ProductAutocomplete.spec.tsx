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
});
