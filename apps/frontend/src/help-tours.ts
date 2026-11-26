import type { UserSession } from './api';
import type { Page } from './navigation-model';
import type { OperationalMode } from './operational-mode';

type TourStep = { title: string; instruction: string };
type HelpTour = {
  id: string;
  mode: 'REVISAO' | 'EXPEDICAO';
  title: string;
  page: Page;
  permissions: readonly string[];
  steps: readonly TourStep[];
};

const shipmentCreate = ['shipments.read', 'shipments.create'];
const shipmentDecide = ['shipments.read', 'shipments.decide'];
const findReceipt: TourStep = {
  title: 'Localize o envio',
  instruction: 'Em Receber produtos, abra a aba Para receber. Localize o envio pelo código da movimentação e selecione Abrir para receber.',
};
const checkReceipt: TourStep = {
  title: 'Confira a entrega',
  instruction: 'Compare o envio com a entrega. Confira a origem, os produtos, os lotes, as quantidades e as fotos disponíveis. Se estiver correto, escolha Confirmar recebimento. Em caso de recusa, a tela pede um motivo.',
};
const sendShipment: TourStep = {
  title: 'Confira e envie',
  instruction: 'Anexe as fotos de cada produto conforme os limites exibidos. Selecione Conferir e enviar, revise o resumo e finalize em Enviar ao destinatário. Acompanhe em Meus envios em aberto enquanto o destinatário ainda não decidiu.',
};

const tours: readonly HelpTour[] = [
  {
    id: 'review-product-create', mode: 'REVISAO', title: 'Cadastrar produto', page: 'products',
    permissions: ['products.read', 'products.create'],
    steps: [
      { title: 'Abra o cadastro', instruction: 'Em Cadastros, abra Produtos. Busque pelo código ou nome para conferir se o produto já existe. Selecione + Novo produto.' },
      { title: 'Preencha os dados do produto', instruction: 'Informe Código, Descrição, Tipo de unidade e Prazo padrão de validade (anos). Siga o formato de código indicado no formulário.' },
      { title: 'Complete os dados da unidade e salve', instruction: 'Para UN, informe a gramatura em gramas. Para FD ou CX, preencha Unidades por embalagem, selecione um código unitário e use Vincular código unitário. Confira os dados, escolha Salvar produto e aguarde a mensagem de sucesso.' },
    ],
  },
  {
    id: 'review-receive', mode: 'REVISAO', title: 'Confirmar recebimento na Revisão', page: 'shipments',
    permissions: shipmentDecide,
    steps: [
      findReceipt,
      checkReceipt,
      { title: 'Confirme e escolha como tratar a separação', instruction: 'Para receber todo o volume em A Revisar, confirme o recebimento. Se a opção de separação imediata estiver disponível no envio da Expedição, escolha entre receber todo o volume ou Receber e iniciar separação. Nesse segundo caso, conclua em Separações em andamento dentro do prazo mostrado. Confira qualquer aviso de validade antes de confirmar.' },
    ],
  },
  {
    id: 'review-stock', mode: 'REVISAO', title: 'Revisar produto', page: 'new-review',
    permissions: ['movements.review'],
    steps: [
      { title: 'Selecione o produto e o lote', instruction: 'Em Revisar produtos, selecione Adicionar produto. Busque o produto, escolha o lote disponível em Revisar e use Adicionar produto/lote.' },
      { title: 'Distribua o que foi revisado', instruction: 'Informe a quantidade a revisar e distribua todo o resultado entre os destinos exibidos. Na desmontagem de FD ou CX, selecione o código unitário resultante e distribua o total em UN. Selecione Salvar item.' },
      { title: 'Conclua a revisão', instruction: 'Abra o resumo com o botão Revisar operacao. Confira lotes, quantidades e distribuição, depois selecione Confirmar revisão. Consulte a operação no Histórico se a tela indicar que ela foi registrada.' },
    ],
  },
  {
    id: 'review-assembly', mode: 'REVISAO', title: 'Enviar com montagem para a Expedição', page: 'shipment-new',
    permissions: shipmentCreate,
    steps: [
      { title: 'Ative a montagem no novo envio', instruction: 'Em Enviar produtos, escolha Expedição em Enviar para, marque Montar fardos/caixas com unidades disponíveis e selecione Adicionar produto.' },
      { title: 'Escolha a embalagem e suas origens', instruction: 'Selecione o código UN e uma Embalagem vinculada. Marque as posições de origem e informe a quantidade de embalagens. Na montagem comum, use o mesmo lote. A opção Usar datas misturadas (Lote 0) exige origens com datas diferentes.' },
      { title: 'Confira o saldo e adicione a embalagem', instruction: 'Com uma posição selecionada, a tela calcula as unidades da retirada. Com várias, informe a parcela de cada posição até completar as unidades necessárias para todas as embalagens. Selecione Adicionar embalagem.' },
      sendShipment,
    ],
  },
  {
    id: 'expedition-send', mode: 'EXPEDICAO', title: 'Enviar produto para a Revisão', page: 'shipment-new',
    permissions: shipmentCreate,
    steps: [
      { title: 'Informe o carregamento', instruction: 'Em Enviar produtos, o destino é Revisão. Informe se o envio está carregado. Para Carregado, preencha também Placa do veículo.' },
      { title: 'Adicione os produtos', instruction: 'Selecione Adicionar produto. Escolha o produto, informe lote, fabricação, validade e quantidade conforme os campos exibidos. Confira os dados de lote apresentados e selecione Adicionar item.' },
      sendShipment,
    ],
  },
  {
    id: 'expedition-receive', mode: 'EXPEDICAO', title: 'Confirmar recebimento na Expedição', page: 'shipments',
    permissions: shipmentDecide,
    steps: [
      findReceipt,
      checkReceipt,
      { title: 'Conclua o recebimento', instruction: 'Confira o resumo e selecione Confirmar recebimento. A saída é concluída sem descontar novamente o saldo já reservado pela Revisão. A movimentação concluída aparece no Histórico.' },
    ],
  },
];

export function availableHelpTours(user: UserSession, mode: OperationalMode) {
  return tours.filter((tour) => tour.mode === mode && tour.mode === (user.sector ?? 'REVISAO')
    && tour.permissions.every((permission) => user.permissions.includes(permission)));
}
