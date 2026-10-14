import { describe, expect, it } from 'vitest';
import { formatShipmentObservation } from './shipment-observation';

const originalId = '4378bb70-bef3-4a00-a046-4e2bfb58db75';
const returnId = '4378bb70-bef3-4a00-a046-4e2bfb58db76';
const shipment = { id: returnId, codigoMovimentacao: 'SAI-000321', sourceShipmentId: originalId,
  sourceShipment: { id: originalId, codigoMovimentacao: 'ENT-000123' } };

describe('referências públicas nas observações automáticas', () => {
  it('identifica o recebimento original do retorno pelo código correto', () => {
    expect(formatShipmentObservation(`Retorno imediato do recebimento ${originalId}.`, shipment)).toBe('Retorno imediato do recebimento ENT-000123.');
    expect(shipment.sourceShipmentId).toBe(originalId);
  });
  it('identifica o envio confirmado e aceita o código da movimentação como referência', () => {
    const message = `Envio ${returnId} confirmado pelo destinatário.`;
    expect(formatShipmentObservation(message, shipment)).toBe('Envio SAI-000321 confirmado pelo destinatário.');
    expect(formatShipmentObservation(message, { id: returnId }, 'SAI-000321')).toBe('Envio SAI-000321 confirmado pelo destinatário.');
  });
  it('preserva observações livres, referências desconhecidas e mensagens já públicas', () => {
    const free = `Conferir o documento ${originalId} na chegada.`;
    expect(formatShipmentObservation(free, shipment)).toBe(free);
    const unrelated = `Retorno imediato do recebimento 4378bb70-bef3-4a00-a046-4e2bfb58db77.`;
    expect(formatShipmentObservation(unrelated, shipment)).toBe(unrelated);
    expect(formatShipmentObservation('Retorno imediato do recebimento ENT-000123.', shipment)).toBe('Retorno imediato do recebimento ENT-000123.');
    expect(formatShipmentObservation(null, shipment)).toBeNull();
  });
});
