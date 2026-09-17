export interface PhotoDraft { key: string; photo?: File; photoUrl?: string }

export const allShipmentPhotosReady = (items: PhotoDraft[]): boolean => items.length > 0 && items.every((item) => item.photo instanceof File);

export function replaceShipmentPhoto<T extends PhotoDraft>(items: T[], key: string, photo: File, photoUrl: string, revoke: (url: string) => void): T[] {
  return items.map((item) => {
    if (item.key !== key) return item;
    if (item.photoUrl) revoke(item.photoUrl);
    return { ...item, photo, photoUrl };
  });
}
