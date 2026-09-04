import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { CreateReviewDto } from './create-review.dto';

describe('CreateReviewDto', () => {
  const validPayload = {
    requestKey: '50000000-0000-4000-8000-000000000001',
    items: [{
      productId: '60000000-0000-4000-8000-000000000001',
      batchId: '70000000-0000-4000-8000-000000000001',
      quantity: 10,
      distributions: [{
        destinationLocationId: '10000000-0000-4000-8000-000000000003',
        quantity: 10,
      }],
    }],
  };

  const errorsFor = (payload: object): Promise<ValidationError[]> => validate(
    plainToInstance(CreateReviewDto, payload),
    { whitelist: true, forbidNonWhitelisted: true },
  );

  it('aceita o contrato que referencia somente produto e lote existentes', async () => {
    await expect(errorsFor(validPayload)).resolves.toHaveLength(0);
  });

  it.each([0, -1, 0.0000001])('rejeita quantidade revisada invalida: %s', async (quantity) => {
    const errors = await errorsFor({
      ...validPayload,
      items: [{ ...validPayload.items[0], quantity }],
    });
    expect(errors).not.toHaveLength(0);
  });

  it('rejeita distribuicao zero, negativa ou com mais de seis casas', async () => {
    for (const quantity of [0, -1, 0.0000001]) {
      const errors = await errorsFor({
        ...validPayload,
        items: [{
          ...validPayload.items[0],
          distributions: [{ ...validPayload.items[0].distributions[0], quantity }],
        }],
      });
      expect(errors).not.toHaveLength(0);
    }
  });

  it('nao permite campos para criar ou trocar o lote durante a revisao', async () => {
    const errors = await errorsFor({
      ...validPayload,
      items: [{
        ...validPayload.items[0],
        newBatchCode: 'NOVOLOTE',
        manufacturingDate: '2026-09-02',
        expirationDate: '2027-09-02',
      }],
    });
    expect(errors[0]?.children?.[0]?.children?.map((error) => error.property)).toEqual(
      expect.arrayContaining(['newBatchCode', 'manufacturingDate', 'expirationDate']),
    );
  });
});
