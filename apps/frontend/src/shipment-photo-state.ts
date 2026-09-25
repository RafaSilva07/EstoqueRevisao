import { ShipmentPhotoLimits } from './api';

export interface PhotoAttachment { file: File; url: string }
export interface PhotoDraft { key: string; photos: PhotoAttachment[] }

export function allShipmentPhotosReady(items: PhotoDraft[], limits: ShipmentPhotoLimits | null): boolean {
  if (!limits || items.length === 0) return false;
  const total = items.reduce((sum, item) => sum + item.photos.length, 0);
  return total <= 100 && items.every((item) => item.photos.length >= limits.minimum && item.photos.length <= limits.maximum);
}
