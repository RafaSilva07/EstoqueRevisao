import { Product } from './api';

export type ProductSearchField = 'code' | 'name';

export function filterAvailableProducts(products: Product[], field: ProductSearchField, query: string): Product[] {
  const normalized = query.trim().toLocaleLowerCase('pt-BR');
  return products.filter((product) => (
    (field === 'code' ? product.code : product.name).toLocaleLowerCase('pt-BR').includes(normalized)
  )).slice(0, 20);
}
