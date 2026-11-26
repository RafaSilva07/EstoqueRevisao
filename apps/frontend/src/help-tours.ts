import type { UserSession } from './api';
import type { Page } from './navigation-model';
import type { OperationalMode } from './operational-mode';

export type TourId = 'review-product-create' | 'review-receive' | 'review-stock' | 'review-assembly' | 'expedition-send' | 'expedition-receive';

export interface HelpTour {
  id: TourId;
  mode: 'REVISAO' | 'EXPEDICAO';
  title: string;
  page: Page;
  permissions: readonly string[];
}

const shipmentCreate = ['shipments.read', 'shipments.create'];
const shipmentDecide = ['shipments.read', 'shipments.decide'];

const tours: readonly HelpTour[] = [
  { id: 'review-product-create', mode: 'REVISAO', title: 'Cadastrar produto', page: 'products', permissions: ['products.read', 'products.create'] },
  { id: 'review-receive', mode: 'REVISAO', title: 'Confirmar recebimento na Revisão', page: 'shipments', permissions: shipmentDecide },
  { id: 'review-stock', mode: 'REVISAO', title: 'Revisar produto', page: 'new-review', permissions: ['movements.review'] },
  { id: 'review-assembly', mode: 'REVISAO', title: 'Enviar com montagem para a Expedição', page: 'shipment-new', permissions: shipmentCreate },
  { id: 'expedition-send', mode: 'EXPEDICAO', title: 'Enviar produto para a Revisão', page: 'shipment-new', permissions: shipmentCreate },
  { id: 'expedition-receive', mode: 'EXPEDICAO', title: 'Confirmar recebimento na Expedição', page: 'shipments', permissions: shipmentDecide },
];

export function availableHelpTours(user: UserSession, mode: OperationalMode) {
  return tours.filter((tour) => tour.mode === mode && tour.mode === (user.sector ?? 'REVISAO')
    && tour.permissions.every((permission) => user.permissions.includes(permission)));
}
