import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ShipmentsPage } from './ShipmentsPage';
import { NewShipment } from './NewShipment';

describe('Interface de envios', () => {
  it('mostra as três consultas e ação específica do setor externo', () => {
    const html = renderToStaticMarkup(<ShipmentsPage user={{id:'u',username:'Operador',sector:'PRODUCAO',roles:['PRODUCAO'],permissions:['shipments.read','shipments.create']}} />);
    for (const text of ['Aguardando minha ação','Enviados por mim','Histórico','Novo envio para Revisão','Aguardando meu recebimento']) expect(html).toContain(text);
    expect(html).not.toContain('Cancelar movimentação');
  });
  it('não oferece criação a quem só pode consultar', () => {
    const html = renderToStaticMarkup(<ShipmentsPage user={{id:'u',username:'Consulta',sector:'REVISAO',roles:[],permissions:['shipments.read']}} />);
    expect(html).not.toContain('Novo envio');
  });
  it('orienta reserva na Revisão e não permite enviar sem itens', () => {
    const html = renderToStaticMarkup(<NewShipment sector="REVISAO" onCreated={() => undefined} onClose={() => undefined} />);
    expect(html).toContain('fica em trânsito');
    expect(html).toContain('Produção'); expect(html).toContain('Expedição');
    expect(html).toContain('Adicionar produto');
    expect(html).not.toContain('Digite no código ou na descrição');
    expect(html).not.toContain('Observação deste produto');
    expect(html).toContain('Observação geral do envio');
    expect(html).toContain('<button disabled="">Conferir e enviar</button>');
  });
});
