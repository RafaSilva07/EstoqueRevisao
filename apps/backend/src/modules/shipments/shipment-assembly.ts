import { BadRequestException } from '@nestjs/common';
import { ShipmentAssembly } from './shipment.entity';

export function assemblyOutput(
  packageQuantity: number,
  unitsPerPackage: number,
  sources: ShipmentAssembly['sources'],
  mixedDates: boolean,
): Pick<ShipmentAssembly, 'outputLot' | 'outputManufacturingDate' | 'outputExpirationDate'> {
  const totalUnits = packageQuantity * unitsPerPackage;
  if (!Number.isSafeInteger(packageQuantity) || packageQuantity < 1 || !Number.isSafeInteger(unitsPerPackage)
    || unitsPerPackage < 1 || !Number.isSafeInteger(totalUnits) || !sources.length
    || sources.some((source) => !Number.isSafeInteger(source.quantity) || source.quantity < 1)
    || sources.reduce((sum, source) => sum + source.quantity, 0) !== totalUnits) {
    throw new BadRequestException('A soma das parcelas deve fechar exatamente a quantidade de embalagens.');
  }
  const dates = new Set(sources.map((source) => `${source.manufacturingDate}:${source.expirationDate}`));
  const batches = new Set(sources.map((source) => source.batchId));
  if (mixedDates ? dates.size < 2 : batches.size !== 1) {
    throw new BadRequestException('Selecione datas diferentes para Lote 0 ou mantenha apenas um lote.');
  }
  const first = sources[0];
  return { outputLot: mixedDates ? '0' : first.lot,
    outputManufacturingDate: mixedDates ? null : first.manufacturingDate,
    outputExpirationDate: mixedDates ? null : first.expirationDate };
}
