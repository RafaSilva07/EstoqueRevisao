import { PcpMovementDetail } from './api';

export const canExecutePcp = (movement: Pick<PcpMovementDetail, 'operationalStatus' | 'pcpExecutionStatus'>): boolean =>
  movement.operationalStatus === 'CONCLUIDA' && movement.pcpExecutionStatus === 'PENDENTE';
