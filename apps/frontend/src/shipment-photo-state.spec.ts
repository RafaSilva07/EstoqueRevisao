import { describe, expect, it, vi } from 'vitest';
import { allShipmentPhotosReady, replaceShipmentPhoto } from './shipment-photo-state';

describe('Fotos dos itens do envio', () => {
  const file = (name: string) => new File(['photo'], name, { type: 'image/jpeg' });
  it('só libera o envio quando todos os itens possuem foto', () => {
    expect(allShipmentPhotosReady([])).toBe(false);
    expect(allShipmentPhotosReady([{ key: 'a', photo: file('a.jpg') }, { key: 'b' }])).toBe(false);
    expect(allShipmentPhotosReady([{ key: 'a', photo: file('a.jpg') }, { key: 'b', photo: file('b.jpg') }])).toBe(true);
  });
  it('associa e substitui somente a foto do item correto', () => {
    const revoke = vi.fn();
    const result = replaceShipmentPhoto([{ key: 'a', photo: file('old.jpg'), photoUrl: 'old' }, { key: 'b' }], 'a', file('new.jpg'), 'new', revoke);
    expect(result[0]).toMatchObject({ key: 'a', photoUrl: 'new' }); expect(result[1]).toEqual({ key: 'b' }); expect(revoke).toHaveBeenCalledWith('old');
  });
});
