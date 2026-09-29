import { BadRequestException } from '@nestjs/common';
import { assemblyOutput } from './shipment-assembly';
import { ShipmentAssembly } from './shipment.entity';

const first: ShipmentAssembly['sources'][number] = {
  batchId: 'batch-a', stockLocationId: 'location-a', quantity: 6,
  lot: 'SOCDNV', manufacturingDate: '2026-08-31', expirationDate: '2028-08-31', locationName: 'Lata Boa',
};
const second: ShipmentAssembly['sources'][number] = {
  batchId: 'batch-b', stockLocationId: 'location-b', quantity: 4,
  lot: 'SOCDNA', manufacturingDate: '2026-09-01', expirationDate: '2028-09-01', locationName: 'TUF',
};

describe('montagem de embalagens', () => {
  it('preserva lote e datas quando duas posições têm o mesmo lote', () => {
    expect(assemblyOutput(1, 10, [first, { ...first, stockLocationId: 'location-b', quantity: 4 }], false))
      .toEqual({ outputLot: 'SOCDNV', outputManufacturingDate: '2026-08-31', outputExpirationDate: '2028-08-31' });
  });
  it('identifica datas misturadas sem inventar uma fabricação ou validade única', () => {
    expect(assemblyOutput(1, 10, [first, second], true))
      .toEqual({ outputLot: '0', outputManufacturingDate: null, outputExpirationDate: null });
  });
  it('rejeita soma divergente, quantidade quebrada e combinação de lotes sem modo misto', () => {
    expect(() => assemblyOutput(2, 10, [first, second], true)).toThrow(BadRequestException);
    expect(() => assemblyOutput(1.5, 10, [first, second], true)).toThrow(BadRequestException);
    expect(() => assemblyOutput(1, 10, [first, { ...second, quantity: 3.5 }], true)).toThrow(BadRequestException);
    expect(() => assemblyOutput(1, 10, [first, second], false)).toThrow(BadRequestException);
    expect(() => assemblyOutput(1, 10, [{ ...first, quantity: 10 }], true)).toThrow(BadRequestException);
  });
});
