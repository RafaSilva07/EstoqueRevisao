import { PcpMovementDetail } from './api';

export const canExecutePcp = (movement: Pick<PcpMovementDetail, 'operationalStatus' | 'pcpExecutionStatus'> & { requiresPcpExecution?: boolean }): boolean =>
  movement.requiresPcpExecution !== false && movement.operationalStatus === 'CONCLUIDA' && movement.pcpExecutionStatus === 'PENDENTE';
