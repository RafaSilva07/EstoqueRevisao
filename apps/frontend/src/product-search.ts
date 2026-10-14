import { Product } from './api';

export type ProductSearchField = 'code' | 'name';

export function filterAvailableProducts(products: Product[], field: ProductSearchField, query: string): Product[] {
  const normalize = (value: string) => value.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  return products.filter((product) => {
    const text = normalize(field === 'code' ? product.code : product.name);
    return terms.every((term) => text.includes(term));
  }).slice(0, 20);
}
