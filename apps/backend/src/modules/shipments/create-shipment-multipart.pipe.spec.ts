import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { ShipmentsController } from './shipments.controller';
import { CreateShipmentMultipartPipe } from './create-shipment-multipart.pipe';

describe('CreateShipmentMultipartPipe', () => {
  it('converte o JSON multipart válido no DTO do envio', async () => {
    const payload = JSON.stringify({
      requestKey: randomUUID(),
      destinationSector: 'REVISAO',
      confirmedExpirationKeys: [],
      items: [{
        productId: randomUUID(),
        batchId: randomUUID(),
        stockLocationId: randomUUID(),
        quantity: 13,
      }],
    });

    const dto = await new CreateShipmentMultipartPipe().transform(payload);

    expect(dto.destinationSector).toBe('REVISAO');
    expect(dto.items[0].quantity).toBe(13);
  });

  it('mantém o parâmetro do controller como texto antes da conversão multipart', () => {
    const parameterTypes = Reflect.getMetadata(
      'design:paramtypes',
      ShipmentsController.prototype,
      'create',
    ) as unknown[];

    expect(parameterTypes[0]).toBe(String);
  });
});
