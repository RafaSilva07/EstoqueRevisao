import { BadRequestException } from '@nestjs/common';
import { Sector, ShipmentLoadingStatus } from './shipment.entity';

export function resolveShipmentLoading(origin: Sector, destination: Sector, status?: ShipmentLoadingStatus, plate?: string): {
  loadingStatus: ShipmentLoadingStatus | null; vehiclePlate: string | null;
} {
  const vehiclePlate = plate?.trim().toUpperCase() || null;
  if (origin !== 'EXPEDICAO' || destination !== 'REVISAO') {
    if (status || vehiclePlate) throw new BadRequestException('Carregamento e placa são exclusivos do envio da Expedição para Revisão.');
    return { loadingStatus: null, vehiclePlate: null };
  }
  if (!status) throw new BadRequestException('Informe se o envio da Expedição está carregado.');
  if (status === 'CARREGADO' && !vehiclePlate) throw new BadRequestException('Informe a placa do veículo do envio carregado.');
  if (status === 'NAO_CARREGADO' && vehiclePlate) throw new BadRequestException('A placa só deve ser informada quando o envio está carregado.');
  return { loadingStatus: status, vehiclePlate: status === 'CARREGADO' ? vehiclePlate : null };
}
