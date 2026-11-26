import type { TourId } from './help-tours';
import type { TourHint } from './tour-hints';

type PreviewStep = Pick<TourHint, 'target' | 'title' | 'instruction'> & {
  related?: readonly string[];
  opensWith?: { target: 'product-new' | 'receipt-open' | 'receipt-confirm' | 'review-add' | 'shipment-open' | 'shipment-add'; checked?: string };
  prerequisite?: { target: string; message: string };
};

const receiptStart: PreviewStep[] = [
  { target: 'receipt-open', related: ['receipt-search', 'receipt-tab-pending'], title: 'Encontre o envio pendente', instruction: 'Em Para receber, identifique o envio pelo código e pela origem. Abra o cartão correspondente para ver os itens.' },
  { target: 'receipt-confirm', opensWith: { target: 'receipt-open' }, title: 'Compare a entrega com o envio', instruction: 'Confira origem, lotes, quantidades e fotos. Abra Confirmar recebimento se a entrega estiver correta.' },
];
const receiptEnd: PreviewStep[] = [
  { target: 'receipt-submit', opensWith: { target: 'receipt-confirm' }, title: 'Confira e confirme o recebimento', instruction: 'Revise os dados antes de confirmar. Se o sistema mostrar uma diferença de validade, compare as datas antes de decidir.' },
  { target: 'receipt-refuse', related: ['receipt-reason', 'receipt-refuse-submit'], prerequisite: { target: 'receipt-decision-back', message: 'Volte aos detalhes do envio para abrir a opção de recusa.' }, title: 'Se a entrega divergir', instruction: 'Use Recusar envio apenas se a entrega não puder ser aceita. Informe o motivo, que fica disponível ao remetente.' },
];
const receiptResult: PreviewStep = {
  target: 'receipt-result', title: 'Onde conferir o resultado', instruction: 'Após confirmar ou recusar, confira a mensagem da operação. Consulte o Histórico se ele estiver disponível para sua conta.',
};
const shipmentEnd: PreviewStep[] = [
  { target: 'shipment-photo', related: ['shipment-photo-loading'], title: 'Anexe as fotos', instruction: 'Use Tirar foto ou Escolher fotos. Confira o mínimo e o máximo indicados para cada produto.' },
  { target: 'shipment-summary', title: 'Abra o resumo do envio', instruction: 'Use Conferir e enviar depois de reunir os itens e as fotos. Ainda é possível corrigir as informações.' },
  { target: 'shipment-confirm', title: 'Decida se quer enviar', instruction: 'Confira destinatário, lotes, quantidades, fotos e eventuais avisos. Confirme o envio apenas se estiver tudo certo.' },
  { target: 'shipment-result', title: 'Onde acompanhar o envio', instruction: 'Após enviar, acompanhe o registro em Meus envios em aberto até o destinatário tomar uma decisão.' },
];

export const tourPreview: Record<TourId, readonly PreviewStep[]> = {
  'review-product-create': [
    { target: 'product-new', related: ['product-search'], title: 'Abra o cadastro', instruction: 'Em Produtos, procure pelo código ou pela descrição para evitar duplicidade. Se ainda não existir, use + Novo produto.' },
    { target: 'product-code', opensWith: { target: 'product-new' }, title: 'Informe o código', instruction: 'Use seis dígitos, com ponto e mais dois dígitos opcionais.' },
    { target: 'product-name', title: 'Informe a descrição', instruction: 'Digite o nome como ele deve aparecer nas buscas e nas movimentações.' },
    { target: 'product-unit', title: 'Escolha o tipo de unidade', instruction: 'Escolha UN (unidade), FD (fardo) ou CX (caixa). A escolha determina os campos do cadastro.' },
    { target: 'product-life', title: 'Defina o prazo padrão', instruction: 'Informe o prazo de validade em anos inteiros. O sistema usa esse valor para sugerir datas.' },
    { target: 'product-weight', prerequisite: { target: 'product-unit', message: 'Selecione UN para mostrar a gramatura.' }, title: 'Para UN, informe a gramatura', instruction: 'Digite o peso de uma unidade, em gramas.' },
    { target: 'product-package-size', prerequisite: { target: 'product-unit', message: 'Selecione FD ou CX para mostrar o conteúdo da embalagem.' }, title: 'Para FD ou CX, informe o conteúdo', instruction: 'Digite quantas unidades cabem no fardo ou na caixa.' },
    { target: 'product-package-search', prerequisite: { target: 'product-unit', message: 'Selecione FD ou CX para mostrar a busca pelo código unitário.' }, related: ['product-package-link'], title: 'Para FD ou CX, vincule o código unitário', instruction: 'Busque um produto UN já cadastrado, use Vincular código unitário e confira a lista de vínculos.' },
    { target: 'product-save', title: 'Confira antes de salvar', instruction: 'Revise os dados e use Salvar produto. Se a tela indicar erro ou duplicidade, confira o cadastro e corrija os dados.' },
    { target: 'product-result', prerequisite: { target: 'product-save', message: 'A mensagem aparece após salvar. Você pode concluir a prévia aqui.' }, title: 'Onde conferir o cadastro', instruction: 'Após salvar, verifique a mensagem de sucesso e procure o novo produto na lista.' },
  ],
  'review-receive': [
    ...receiptStart,
    { target: 'receipt-separation', prerequisite: { target: 'receipt-submit', message: 'A opção de separação depende do envio e da permissão da conta.' }, opensWith: { target: 'receipt-confirm' }, title: 'Escolha como receber', instruction: 'Quando a opção aparecer, decida se vai receber todo o volume ou iniciar a separação imediata.' },
    ...receiptEnd,
    { target: 'separation-open', related: ['receipt-tab-separation'], title: 'Se for separar, confira o prazo', instruction: 'Abra a separação após o recebimento ou retome pelo código em Separações em andamento.' },
    { target: 'separation-amount', title: 'Informe as quantidades de retorno', instruction: 'Indique o que voltará à Expedição. Use zero nos itens sem retorno.' },
    { target: 'separation-photo', title: 'Anexe as fotos do retorno', instruction: 'Inclua as fotos solicitadas nos itens com devolução e confira os limites da tela.' },
    { target: 'separation-confirm', title: 'Conclua a separação dentro do prazo', instruction: 'Confira quantidades e fotos. Use Concluir separação quando estiver pronto ou Salvar e sair para retomar depois.' },
    receiptResult,
  ],
  'review-stock': [
    { target: 'review-add', related: ['review-empty'], title: 'Abra a seleção de produtos', instruction: 'Use Adicionar produto ou Continuar produto para consultar os lotes com saldo em Revisar.' },
    { target: 'review-product', opensWith: { target: 'review-add' }, title: 'Escolha o produto', instruction: 'Busque pelo código ou pela descrição e selecione uma das sugestões.' },
    { target: 'review-lot', prerequisite: { target: 'review-product', message: 'Escolha um produto para consultar os lotes disponíveis.' }, related: ['review-select'], title: 'Escolha e inclua o lote', instruction: 'Confira lote, validade e saldo. Use + Adicionar produto/lote para abrir a distribuição.' },
    { target: 'review-quantity', title: 'Informe a quantidade a revisar', instruction: 'Digite uma quantidade inteira dentro do saldo do lote.' },
    { target: 'review-output', title: 'Para fardo ou caixa, escolha a unidade resultante', instruction: 'Selecione um código UN vinculado ao produto. A distribuição será feita em unidades.' },
    { target: 'review-distribution', title: 'Distribua toda a quantidade', instruction: 'Preencha os destinos com números inteiros e confira se o total distribuído corresponde à quantidade a revisar.' },
    { target: 'review-save-item', title: 'Salve o item da revisão', instruction: 'Use Salvar item e, se precisar, adicione outros lotes.' },
    { target: 'review-summary', title: 'Abra o resumo da revisão', instruction: 'Use Revisar operação depois de conferir os itens da lista.' },
    { target: 'review-confirm', title: 'Confira antes de confirmar', instruction: 'Compare lotes, quantidades e destinos. Leia os avisos exibidos pelo sistema antes de confirmar.' },
    { target: 'review-result', title: 'Onde conferir a revisão', instruction: 'Após a confirmação, consulte a movimentação no Histórico se ele estiver disponível para sua conta.' },
  ],
  'review-assembly': [
    { target: 'shipment-open', title: 'Abra um novo envio', instruction: 'Abra o formulário de novo envio no setor Revisão.' },
    { target: 'shipment-destination', opensWith: { target: 'shipment-open' }, title: 'Selecione Expedição como destino', instruction: 'Defina o destino antes de adicionar itens ao envio.' },
    { target: 'shipment-assembly', prerequisite: { target: 'shipment-destination', message: 'Selecione Expedição para mostrar a opção de montagem.' }, title: 'Ative a montagem', instruction: 'Marque Montar fardos/caixas com unidades disponíveis antes de incluir itens.' },
    { target: 'shipment-add', title: 'Abra a inclusão de produto', instruction: 'Use Adicionar produto para abrir o formulário da embalagem.' },
    { target: 'assembly-unit', prerequisite: { target: 'shipment-assembly', message: 'Ative a montagem para incluir a unidade de origem.' }, opensWith: { target: 'shipment-add', checked: 'shipment-assembly' }, title: 'Escolha a unidade de origem', instruction: 'Busque e selecione um produto com código UN.' },
    { target: 'assembly-package', title: 'Selecione a embalagem vinculada', instruction: 'Escolha o fardo ou a caixa e confira quantas unidades compõem a embalagem.' },
    { target: 'assembly-mixed', title: 'Confira a opção de Lote 0', instruction: 'Na montagem comum, use um lote. Se for montar Lote 0, marque a opção e use origens com datas diferentes.' },
    { target: 'assembly-source', related: ['assembly-more', 'assembly-positions'], title: 'Escolha as posições de origem', instruction: 'Escolha posições com saldo. Para Lote 0, selecione ao menos duas origens com datas diferentes.' },
    { target: 'assembly-quantity', title: 'Informe quantas embalagens serão montadas', instruction: 'Digite uma quantidade inteira dentro do limite de estoque mostrado.' },
    { target: 'assembly-share', title: 'Distribua as unidades se houver várias origens', instruction: 'Informe quanto sai de cada posição até completar o total indicado, respeitando o saldo disponível.' },
    { target: 'assembly-add', title: 'Inclua a embalagem', instruction: 'Confira quantidades, posições e lote. Use Adicionar embalagem para incluir o item no envio.' },
    ...shipmentEnd,
  ],
  'expedition-send': [
    { target: 'shipment-open', title: 'Abra um novo envio', instruction: 'Abra o formulário de envio da Expedição para a Revisão.' },
    { target: 'shipment-loading', opensWith: { target: 'shipment-open' }, title: 'Informe como o produto segue', instruction: 'Escolha Carregado ou Não carregado de acordo com o envio.' },
    { target: 'shipment-plate', prerequisite: { target: 'shipment-loading', message: 'Selecione Carregado para mostrar o campo da placa.' }, title: 'Se estiver carregado, informe a placa', instruction: 'Preencha a placa do veículo quando a opção Carregado estiver selecionada.' },
    { target: 'shipment-add', title: 'Abra a inclusão de produto', instruction: 'Use Adicionar produto para abrir o formulário do item.' },
    { target: 'shipment-product', opensWith: { target: 'shipment-add' }, title: 'Selecione o produto', instruction: 'Busque pelo código ou pela descrição e escolha uma sugestão.' },
    { target: 'shipment-lot', title: 'Informe o lote ou a fabricação', instruction: 'Preencha um dos campos e saia dele para o sistema preencher e validar o outro.' },
    { target: 'shipment-expiry', title: 'Confira a validade', instruction: 'Confira a data sugerida ou informe a validade quando não houver sugestão. Compare com a fabricação.' },
    { target: 'shipment-quantity', title: 'Informe a quantidade', instruction: 'Digite uma quantidade inteira na unidade exibida.' },
    { target: 'shipment-add-item', title: 'Inclua o item', instruction: 'Use Adicionar item para retornar ao envio e anexar as fotos.' },
    ...shipmentEnd,
  ],
  'expedition-receive': [...receiptStart, ...receiptEnd, receiptResult],
};
