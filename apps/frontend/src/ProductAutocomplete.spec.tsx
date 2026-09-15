import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProductAutocomplete } from './ProductAutocomplete';

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
});
