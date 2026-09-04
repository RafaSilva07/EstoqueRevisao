import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { CreateEffectiveMovementDto } from './create-effective-movement.dto';
import { CreateInternalTransferDto } from './create-internal-transfer.dto';

describe('CreateInternalTransferDto', () => {
  const payload = {
    requestKey: '50000000-0000-4000-8000-000000000001',
    originLocationId: '10000000-0000-4000-8000-000000000002',
    destinationLocationId: '10000000-0000-4000-8000-000000000005',
    items: [{
      productId: '60000000-0000-4000-8000-000000000001',
      batchId: '70000000-0000-4000-8000-000000000001',
      destinationBatchId: '70000000-0000-4000-8000-000000000002',
      quantity: 10,
    }],
  };

  const errorsFor = (
    type: typeof CreateInternalTransferDto | typeof CreateEffectiveMovementDto,
    value: object,
  ): Promise<ValidationError[]> => validate(
    plainToInstance(type, value),
    { whitelist: true, forbidNonWhitelisted: true },
  );

  it('exige o lote de destino na transferencia', async () => {
    await expect(errorsFor(CreateInternalTransferDto, {
      ...payload,
      items: [{
        productId: payload.items[0].productId,
        batchId: payload.items[0].batchId,
        quantity: payload.items[0].quantity,
      }],
    })).resolves.not.toHaveLength(0);
  });

  it('aceita lotes de origem e destino validos', async () => {
    await expect(errorsFor(CreateInternalTransferDto, payload)).resolves.toHaveLength(0);
  });

  it('rejeita lote de destino nos contratos de entrada e saida', async () => {
    const errors = await errorsFor(CreateEffectiveMovementDto, payload);
    expect(errors[0]?.children?.[0]?.children?.map((error) => error.property))
      .toContain('destinationBatchId');
  });
});
