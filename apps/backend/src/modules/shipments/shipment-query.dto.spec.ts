import 'reflect-metadata';
import { validate } from 'class-validator';
import { ShipmentQueryDto } from './shipment.dto';

describe('Consulta de envios da Home', () => {
  it('aceita a visão de movimentações abertas e o status de separação', async () => {
    const query = Object.assign(new ShipmentQueryDto(), { view: 'open', status: 'EM_SEPARACAO' });
    expect(await validate(query)).toHaveLength(0);
  });

  it('rejeita visão e status desconhecidos', async () => {
    const query = Object.assign(new ShipmentQueryDto(), { view: 'unknown', status: 'ABERTO' });
    expect((await validate(query)).map((error) => error.property).sort()).toEqual(['status', 'view']);
  });
});
