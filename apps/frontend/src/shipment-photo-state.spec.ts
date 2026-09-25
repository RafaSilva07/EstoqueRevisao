import { describe, expect, it } from 'vitest';
import { allShipmentPhotosReady } from './shipment-photo-state';

describe('Fotos dos itens do envio', () => {
  const file = (name: string) => new File(['photo'], name, { type: 'image/jpeg' });
  const photo = (name: string) => ({ file: file(name), url: name });
  it('exige o mínimo configurado por produto e respeita o máximo', () => {
    const limits = { minimum: 2, maximum: 3 };
    expect(allShipmentPhotosReady([], limits)).toBe(false);
    expect(allShipmentPhotosReady([{ key: 'a', photos: [photo('a.jpg')] }], limits)).toBe(false);
    expect(allShipmentPhotosReady([{ key: 'a', photos: [photo('a.jpg'), photo('b.jpg')] }], limits)).toBe(true);
    expect(allShipmentPhotosReady([{ key: 'a', photos: [photo('a.jpg'), photo('b.jpg'), photo('c.jpg'), photo('d.jpg')] }], limits)).toBe(false);
  });
  it('limita o total a 100 fotos por envio', () => {
    const items = Array.from({ length: 34 }, (_, index) => ({ key: String(index), photos: [photo('a.jpg'), photo('b.jpg'), photo('c.jpg')] }));
    expect(allShipmentPhotosReady(items, { minimum: 1, maximum: 3 })).toBe(false);
  });
});
