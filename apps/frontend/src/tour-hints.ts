import type { TourId } from './help-tours';

export interface TourHint {
  target: string;
  title: string;
  instruction: string;
  canContinue?: boolean;
  complete?: boolean;
}

export interface TourView {
  find: (target: string) => HTMLElement | undefined;
  focused: string | undefined;
  reviewed: (target: string) => boolean;
  dialog: string | null;
}

function hint(target: string, title: string, instruction: string, options?: Pick<TourHint, 'complete' | 'canContinue'>): TourHint {
  return { target, title, instruction, ...options };
}

function value(ui: TourView, target: string) {
  const field = ui.find(target);
  return field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement ? field.value : '';
}

function validValue(ui: TourView, target: string) {
  const field = ui.find(target);
  if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)) return false;
  return Boolean(field.value.trim()) && field.validity.valid && field.getAttribute('aria-invalid') !== 'true';
}

function filled(ui: TourView, target: string) {
  // Keep the guidance available while someone is typing. Selection can advance immediately.
  const editing = ui.focused === target && !(ui.find(target) instanceof HTMLSelectElement);
  return !editing && validValue(ui, target);
}

function enabled(ui: TourView, target: string) {
  const element = ui.find(target);
  return Boolean(element && !element.matches(':disabled'));
}

function checked(ui: TourView, target: string) {
  const field = ui.find(target);
  return field instanceof HTMLInputElement && field.checked;
}

function ready(ui: TourView, target: string) {
  return ui.find(target)?.dataset.tourReady === 'true';
}

function emptySelect(ui: TourView, target: string) {
  const select = ui.find(target);
  return select instanceof HTMLSelectElement && !select.disabled && select.options.length < 2;
}

function pending(title: string, instruction: string) {
  return hint('status', title, instruction);
}

function product(ui: TourView): TourHint | undefined {
  if (!ui.dialog) {
    if (ui.find('product-result')) return hint('product-result', 'Cadastro concluído', 'Confira a mensagem de sucesso e o novo produto na lista.', { complete: true });
    if (ui.focused === 'product-search') return hint('product-search', 'Confira se o cadastro já existe', 'Busque pelo código ou pela descrição. Se ainda não existir, use + Novo produto.');
    return hint('product-new', 'Abra o cadastro', 'Confira se o código já existe na busca de Produtos e selecione + Novo produto para abrir o formulário.');
  }
  if (ui.dialog !== 'product-form-title' || !ui.find('product-form')) return;
  if (!filled(ui, 'product-code')) return hint('product-code', 'Informe o código', 'Use seis dígitos, com ponto e mais dois dígitos opcionais. Se houver duplicidade, confira o cadastro apontado e corrija o código.');
  if (!filled(ui, 'product-name')) return hint('product-name', 'Informe a descrição', 'Digite o nome do produto como deve aparecer nas buscas e movimentações.');
  if (value(ui, 'product-unit') === 'UN' && !ui.reviewed('product-unit') && !filled(ui, 'product-life')) {
    return hint('product-unit', 'Confira o tipo de unidade', 'Mantenha UN para unidade ou selecione FD (fardo) ou CX (caixa). A escolha muda os campos abaixo.', { canContinue: true });
  }
  if (!filled(ui, 'product-life')) return hint('product-life', 'Defina o prazo padrão', 'Informe o prazo de validade em anos inteiros. Ele é usado para sugerir datas em novas operações.');
  if (ui.find('product-weight') && !filled(ui, 'product-weight')) return hint('product-weight', 'Informe a gramatura', 'Para UN, digite o peso de uma unidade, em gramas.');
  if (ui.find('product-package-size')) {
    if (!filled(ui, 'product-package-size')) return hint('product-package-size', 'Informe o conteúdo da embalagem', 'Digite quantas unidades cabem no fardo ou na caixa.');
    if (!ui.find('product-linked')) {
      if (enabled(ui, 'product-package-link')) return hint('product-package-link', 'Vincule a unidade', 'Use Vincular código unitário. Confira se o código aparece na lista de vinculados.');
      return hint('product-package-search', 'Selecione uma unidade para vincular', 'Pesquise e escolha um produto UN já cadastrado. Se não houver um código adequado, cadastre a unidade primeiro.');
    }
  }
  return hint('product-save', 'Confira e salve o produto', 'Revise os dados antes de usar Salvar produto. Se a tela indicar um erro, corrija-o e tente novamente.');
}

function review(ui: TourView): TourHint | undefined {
  if (ui.find('review-result')) return hint('review-result', 'Revisão registrada', 'Confira a confirmação da operação no Histórico, quando disponível para sua conta.', { complete: true });
  if (!ui.dialog) {
    if (enabled(ui, 'review-summary')) return hint('review-summary', 'Confira a revisão', 'Se já incluiu todos os lotes, use Revisar operacao para abrir o resumo. Você ainda pode adicionar ou editar itens.');
    return hint('review-add', 'Abra a seleção de produtos', 'Use Adicionar produto ou Continuar produto para escolher um lote com saldo em Revisar.');
  }
  if (ui.dialog === 'review-confirm-title') return hint('review-confirm', 'Confirme a revisão', 'Compare lotes, quantidades e destinos no resumo. Confirme somente se estiver correto. Leia qualquer aviso de validade ou duplicidade antes de decidir.');
  if (ui.dialog !== 'review-item-title') return;
  if (ui.find('review-empty')) return hint('review-empty', 'Sem saldo em Revisar', 'Não há produto ou lote disponível nesta tela. Consulte o estoque e retome quando houver saldo ou quando a origem estiver configurada.');
  if (!ui.find('review-quantity')) {
    if (!enabled(ui, 'review-lot')) return hint('review-product', 'Escolha o produto', 'Busque pelo código ou pela descrição e selecione uma sugestão com saldo em Revisar.');
    if (!ready(ui, 'review-lot')) return hint('review-lot', 'Escolha o lote', ui.find('review-lot')?.dataset.tourOptions === '0'
      ? 'Não há lote disponível para este produto. Volte à busca e escolha outro.'
      : 'Abra a lista e confira lote, validade e saldo antes de selecionar.');
    return hint('review-select', 'Inclua o produto e o lote', 'Use + Adicionar produto/lote para abrir a distribuição.');
  }
  if (!filled(ui, 'review-quantity')) return hint('review-quantity', 'Informe a quantidade a revisar', 'Digite uma quantidade inteira, dentro do saldo exibido para esse lote.');
  if (ui.find('review-output') && !filled(ui, 'review-output')) {
    return hint('review-output', 'Escolha a unidade resultante', emptySelect(ui, 'review-output')
      ? 'Este fardo ou caixa não tem uma unidade ativa vinculada. Confira o cadastro do produto ou escolha outro lote.'
      : 'Selecione o código UN resultante da desmontagem. A distribuição será feita em unidades.');
  }
  if (!enabled(ui, 'review-save-item') || ui.focused === 'review-distribution') return hint('review-distribution', 'Distribua toda a quantidade', 'Preencha os destinos correspondentes. Use inteiros e acompanhe o total distribuído. Salvar item só é liberado quando o total fecha.');
  return hint('review-save-item', 'Salve o item da revisão', 'Use Salvar item para voltar à lista. Adicione outros lotes se precisar ou siga para o resumo.');
}

function separation(ui: TourView): TourHint {
  if (ui.find('separation-photo') && ui.focused !== 'separation-amount') return hint('separation-photo', 'Anexe a foto do retorno', 'Inclua as fotos solicitadas em cada item com devolução. Observe os limites de quantidade e formato da tela.');
  if (ui.find('separation-amount') && (!ui.reviewed('separation-amount') || ui.focused === 'separation-amount')) {
    return hint('separation-amount', 'Informe o que será devolvido', 'Declare somente a quantidade que voltará à Expedição. Deixe zero nos itens sem retorno e confira todos os itens e o prazo mostrado.', { canContinue: true });
  }
  return hint('separation-confirm', 'Conclua dentro do prazo', 'Confira quantidades e fotos. Use Concluir separação quando estiver pronto ou Salvar e sair para retomar em Separações em andamento.');
}

function receipt(ui: TourView): TourHint | undefined {
  if (!ui.dialog) {
    if (ui.find('receipt-result')) return hint('receipt-result', 'Confira o resultado', 'A tela indica o resultado da decisão. Consulte o Histórico ou retome em Separações em andamento, se aplicável.', { complete: true });
    const separating = ui.find('receipt-tab-separation')?.getAttribute('aria-pressed') === 'true';
    if (separating && ui.find('separation-open')) return hint('separation-open', 'Retome a separação', 'Escolha o recebimento pelo código e use Continuar separação. Confira o prazo já em andamento.');
    if (separating && ui.find('receipt-empty')) return hint('receipt-tab-pending', 'Sem separações nesta consulta', 'A aba Para receber mostra as entregas ainda pendentes. Limpe a busca se filtrou por um código.');
    if (!separating && ui.find('receipt-tab-pending')?.getAttribute('aria-pressed') !== 'true') return hint('receipt-tab-pending', 'Abra a lista para receber', 'Use Para receber para consultar os envios pendentes.');
    if (ui.focused === 'receipt-search') return hint('receipt-search', 'Localize pelo código', 'Digite o código da movimentação. Apague o filtro para voltar a ver todos os registros desta consulta.');
    if (ui.find('receipt-open')) return hint('receipt-open', 'Abra o envio certo', 'Identifique-o pelo código e pela origem. Use Abrir para receber ou Ver itens e detalhes no cartão correspondente.');
    if (ui.find('receipt-empty')) return hint('receipt-search', 'Nenhum envio nesta consulta', 'Confira o código ou limpe o filtro. Sem entrega pendente, pause o tour e retome quando houver um recebimento.');
    return hint('receipt-search', 'Consulte os recebimentos', 'Aguarde a lista e, se precisar, busque pelo código da movimentação. Se a consulta falhar, use Tentar novamente.');
  }
  if (ui.dialog === 'shipment-detail-title') {
    if (ui.find('separation-open')) return hint('separation-open', 'Retome a separação', 'Confira o detalhe e use Continuar separação para informar o retorno.');
    if (!ui.find('receipt-confirm')) return hint('status', 'Confira o estado do envio', 'Este envio não tem uma confirmação disponível para sua conta agora. Volte aos recebimentos pendentes e confira o código.');
    if (ui.focused === 'receipt-refuse') return hint('receipt-refuse', 'Se a entrega divergir', 'Confira os itens e use Recusar envio apenas se a entrega não puder ser aceita. O sistema pede um motivo.');
    return hint('receipt-confirm', 'Compare a entrega com o envio', 'Confira origem, lote, quantidade e fotos. Se estiver correto, abra Confirmar recebimento. Em caso de divergência, confira a opção Recusar envio.');
  }
  if (ui.dialog === 'separation-title') return ui.find('separation-confirm') ? separation(ui) : pending('Preparando a separação', 'Aguarde os dados da separação e confira o prazo exibido.');
  if (ui.dialog !== 'shipment-decision-title') return;
  if (ui.find('receipt-reason')) {
    if (!filled(ui, 'receipt-reason')) return hint('receipt-reason', 'Justifique a recusa', 'Explique a divergência. O motivo ficará disponível ao remetente.');
    return hint('receipt-refuse-submit', 'Confira antes de recusar', 'Revise o motivo e confirme a recusa apenas se essa for sua decisão.');
  }
  const confirmation = ui.find('receipt-submit');
  if (!confirmation) return pending('Preparando o recebimento', 'Aguarde o carregamento dos itens e da decisão.');
  if (confirmation.dataset.tourChoice === 'conflict') return hint('receipt-submit', 'Confira a diferença de validade', 'Leia o aviso e compare as datas. Volte se precisar corrigir ou confirme explicitamente se a divergência for aceitável.');
  if (ui.find('receipt-separation') && !ui.reviewed('receipt-separation')) return hint('receipt-separation', 'Escolha se vai separar agora', 'Você pode receber todo o volume ou iniciar a separação agora. Se separar, será preciso informar o retorno dentro do prazo.', { canContinue: true });
  return hint('receipt-submit', 'Confirme sua decisão', confirmation.dataset.tourChoice === 'separate'
    ? 'Use Receber e iniciar separação se essa for sua escolha. Depois, informe os itens de retorno e confira o prazo.'
    : 'Revise os dados e use Confirmar recebimento se estiver tudo certo.');
}

function assemblyItem(ui: TourView): TourHint {
  if (!ui.find('assembly-package')) return hint('assembly-unit', 'Escolha a unidade de origem', 'Selecione uma sugestão com código UN. Fardos e caixas não servem como insumo para a montagem.');
  if (!filled(ui, 'assembly-package')) return hint('assembly-package', 'Selecione a embalagem vinculada', emptySelect(ui, 'assembly-package')
    ? 'Não há fardo ou caixa vinculada a esta unidade. Escolha outra unidade ou confira o cadastro de embalagens.'
    : 'Escolha um fardo ou caixa e confira quantas unidades compõem a embalagem.');
  if (!ui.reviewed('assembly-mixed')) return hint('assembly-mixed', 'Confira a opção de Lote 0', 'Mantenha desmarcada para usar um lote. Marque somente se for usar origens com datas diferentes para montar Lote 0.', { canContinue: true });
  if (!ready(ui, 'assembly-positions')) {
    const target = enabled(ui, 'assembly-source') ? 'assembly-source' : ui.find('assembly-more') ? 'assembly-more' : 'assembly-positions';
    return hint(target, 'Escolha as posições de origem', 'Marque posições com saldo. Use o mesmo lote na montagem comum. No Lote 0, marque pelo menos duas origens com datas diferentes. Se não houver saldo, confira outras posições ou troque a unidade.');
  }
  if (!filled(ui, 'assembly-quantity')) return hint('assembly-quantity', 'Informe quantas embalagens serão montadas', 'Digite uma quantidade inteira dentro do limite. Com uma posição, a tela calcula as unidades que serão retiradas.');
  if (ui.find('assembly-share') && (!ready(ui, 'assembly-add') || ui.focused === 'assembly-share')) return hint('assembly-share', 'Distribua as unidades pelas origens', 'Informe a parcela de cada posição até completar o total indicado. Confira o saldo individual e, no Lote 0, as datas das origens.');
  return hint('assembly-add', 'Inclua a embalagem', 'Confira quantidade, posições, parcelas e lote. Use Adicionar embalagem. Se houver erro, ajuste a indicação exibida no formulário.');
}

function shipment(ui: TourView, assembly: boolean): TourHint | undefined {
  if (ui.dialog === 'shipment-summary-title') return hint('shipment-confirm', 'Confira e decida se quer enviar', ui.find('shipment-confirm')?.dataset.tourChoice
    ? 'Leia o aviso do sistema e confira as informações do envio. Só aceite a diferença se tiver verificado os dados.'
    : 'Revise o destino, os lotes, a quantidade e as fotos. Use Enviar ao destinatário somente se estiver correto.');
  if (ui.dialog === 'add-product-title') {
    if (ui.find('assembly-unit')) return assemblyItem(ui);
    if (assembly && ui.find('shipment-product')) return pending('Neste item, a montagem não está ativa', 'Feche o formulário. No envio para Expedição, marque Montar fardos/caixas antes de adicionar o produto.');
    if (!ui.find('shipment-product-selected')) return hint('shipment-product', 'Selecione o produto', 'Busque pelo código ou pela descrição e escolha uma sugestão da lista.');
    if (!enabled(ui, 'shipment-add-item') || ui.focused === 'shipment-lot') return hint('shipment-lot', 'Informe o lote ou a fabricação', 'Preencha um dos dois e saia do campo para completar e validar o outro. Confira o aviso se a validação falhar.');
    if (!filled(ui, 'shipment-expiry') || !ui.reviewed('shipment-expiry')) return hint('shipment-expiry', 'Confira ou informe a validade', 'Confira a data sugerida. Quando não houver sugestão, informe a validade e verifique se é compatível com a fabricação.', { canContinue: validValue(ui, 'shipment-expiry') });
    if (!filled(ui, 'shipment-quantity')) return hint('shipment-quantity', 'Informe a quantidade', 'Digite uma quantidade inteira do produto na unidade mostrada.');
    return hint('shipment-add-item', 'Inclua o item', 'Use Adicionar item. Depois inclua as fotos ou adicione outro produto, se necessário.');
  }
  if (ui.dialog) return;
  if (ui.find('shipment-result')) return hint('shipment-result', 'Envio registrado', 'Acompanhe o registro em Meus envios em aberto enquanto aguarda a decisão do destinatário.', { complete: true });
  if (ui.find('shipment-open')) return hint('shipment-open', 'Abra um novo envio', 'Use o botão de novo envio para abrir o formulário deste setor.');
  if (assembly) {
    if (value(ui, 'shipment-destination') !== 'EXPEDICAO') return hint('shipment-destination', 'Selecione Expedição como destino', 'Escolha Expedição. Se o destino estiver bloqueado por itens já adicionados, conclua ou guarde o rascunho existente antes de iniciar outro envio.');
    if (!checked(ui, 'shipment-assembly')) return hint('shipment-assembly', 'Ative a montagem', 'Marque Montar fardos/caixas com unidades disponíveis. Se já houver itens no rascunho, a montagem pode estar bloqueada.');
  } else {
    if (!filled(ui, 'shipment-loading')) return hint('shipment-loading', 'Informe como o produto segue', 'Selecione Carregado ou Não carregado. Para Carregado, a placa será solicitada.');
    if (ui.find('shipment-plate') && !filled(ui, 'shipment-plate')) return hint('shipment-plate', 'Informe a placa do veículo', 'Preencha a placa para um envio carregado. Se não estiver carregado, altere a opção acima.');
  }
  if (enabled(ui, 'shipment-summary')) return hint('shipment-summary', 'Abra o resumo do envio', 'Com os itens e as fotos conferidos, use Conferir e enviar. Você ainda pode corrigir os dados antes da decisão final.');
  if (ui.find('shipment-photo')) return hint('shipment-photo', 'Inclua as fotos do produto', 'Use Tirar foto ou Escolher fotos e confira o mínimo e o máximo indicados para cada item.');
  if (ui.find('shipment-photo-loading')) return hint('shipment-photo-loading', 'Aguarde os limites de fotos', 'Você pode anexar as fotos assim que os limites carregarem. Se a tela indicar falha, consulte a mensagem da operação.');
  return hint('shipment-add', 'Adicione um produto ao envio', 'Use Adicionar produto para selecionar e preencher um item.');
}

export function resolveTourHint(id: TourId, ui: TourView): TourHint | undefined {
  switch (id) {
    case 'review-product-create': return product(ui);
    case 'review-stock': return review(ui);
    case 'review-receive':
    case 'expedition-receive': return receipt(ui);
    case 'review-assembly': return shipment(ui, true);
    case 'expedition-send': return shipment(ui, false);
  }
}
