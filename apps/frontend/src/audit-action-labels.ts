const labels: Record<string, string> = {
  USER_CREATE: 'Usuário cadastrado',
  USER_UPDATE: 'Dados e acessos do usuário atualizados',
  USER_DEACTIVATE: 'Usuário inativado',
  USER_PERMISSIONS_PRESET_APPLY: 'Permissões do preset aplicadas ao usuário',
  PERMISSION_PRESET_UPDATE: 'Preset de permissões atualizado',
  SHIPMENT_CREATE: 'Envio criado',
  SHIPMENT_CONFIRM: 'Recebimento confirmado',
  SHIPMENT_REFUSE: 'Envio recusado',
  SHIPMENT_CANCEL: 'Envio cancelado',
  SHIPMENT_ADMIN_CANCEL: 'Solicitação cancelada pelo administrador',
  SHIPMENT_ADMIN_CORRECTION: 'Solicitação corrigida em novo envio vinculado',
  SHIPMENT_ADMIN_MOVEMENT_CANCEL: 'Efeito no estoque estornado pelo administrador',
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
  PCP_MOVEMENT_RECORD_EXECUTE: 'Registro executado pelo PCP',
};

export function auditActionLabel(action: string): string {
  return labels[action] ?? `Evento registrado (${action})`;
}
