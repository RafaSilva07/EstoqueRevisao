import { BadRequestException } from '@nestjs/common';
import { ShipmentPhotoLimits } from '../settings/settings.service';

export const MAX_SHIPMENT_PHOTOS = 100;

export function validatePhotoCounts(items: Array<{ photoCount?: number }>, fileCount: number, limits: ShipmentPhotoLimits): number[] {
  const counts = items.map((item) => item.photoCount ?? 1);
  if (counts.some((count) => !Number.isSafeInteger(count) || count < limits.minimum || count > limits.maximum)) {
    throw new BadRequestException(`Cada produto deve ter entre ${limits.minimum} e ${limits.maximum} foto(s).`);
  }
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (total > MAX_SHIPMENT_PHOTOS || fileCount !== total) {
    throw new BadRequestException('A quantidade de fotos enviada nao corresponde aos produtos ou supera o limite de 100 fotos por envio.');
  }
  return counts;
}
