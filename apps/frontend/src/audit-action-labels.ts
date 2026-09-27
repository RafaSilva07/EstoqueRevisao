const labels: Record<string, string> = {
  SHIPMENT_CREATE: 'Envio criado',
  SHIPMENT_CONFIRM: 'Recebimento confirmado',
  SHIPMENT_REFUSE: 'Envio recusado',
  SHIPMENT_CANCEL: 'Envio cancelado',
  SHIPMENT_SEPARATION_START: 'Separação iniciada',
  SHIPMENT_SEPARATION_DRAFT_SAVE: 'Rascunho da separação salvo',
  SHIPMENT_SEPARATION_COMPLETE: 'Separação concluída',
  SHIPMENT_SEPARATION_EXPIRE: 'Prazo encerrado; recebimento integral registrado',
  SHIPMENT_IMMEDIATE_RETURN_CREATE: 'Envio de retorno criado',
  SHIPMENT_MOVEMENT_CREATE: 'Movimentação de estoque registrada',
  EXTERNAL_ENTRY_CREATE: 'Entrada externa registrada',
  EXTERNAL_EXIT_CREATE: 'Saída externa registrada',
  INTERNAL_TRANSFER_CREATE: 'Transferência interna registrada',
  REVIEW_CREATE: 'Revisão registrada',
  MOVEMENT_CANCEL: 'Movimentação cancelada',
  PCP_MOVEMENT_EXECUTE: 'Execução registrada pelo PCP',
};

export function auditActionLabel(action: string): string {
  return labels[action] ?? `Evento registrado (${action})`;
}
