import { formatDate } from './format';
import { Movement } from './api';

export function movementCancellationImpact(movement: Movement): string[] {
  return movement.items.flatMap((item) => {
    const historicalProduct = item.productSnapshot ?? item.product;
    const product = `${historicalProduct.code} - ${historicalProduct.name}`;
    const originExpiry = item.batch.expirationDate ? ` (validade ${formatDate(item.batch.expirationDate)})` : '';
    const destinationExpiry = item.destinationBatch?.expirationDate ? ` (validade ${formatDate(item.destinationBatch.expirationDate)})` : '';
    if (movement.type === 'ENTRADA_EXTERNA') {
      return [`Retirar ${item.quantity} ${historicalProduct.defaultUnit} de ${product} / lote ${item.batch.code}${originExpiry} / ${movement.destinationLocation?.name}.`];
    }
    if (movement.type === 'SAIDA_EXTERNA') {
      return [`Devolver ${item.quantity} ${historicalProduct.defaultUnit} para ${product} / lote ${item.batch.code}${originExpiry} / ${movement.originLocation.name}.`];
    }
    if (movement.type === 'TRANSFERENCIA_INTERNA') {
      return [`Retirar ${item.quantity} ${historicalProduct.defaultUnit} de ${product} / lote ${item.destinationBatch?.code}${destinationExpiry} / ${movement.destinationLocation?.name} e devolver ao lote ${item.batch.code}${originExpiry} / ${movement.originLocation.name}.`];
    }
    const output = item.outputProductSnapshot ?? historicalProduct;
    return item.distributions.map((distribution) => (
      `Retirar ${distribution.quantity} ${output.defaultUnit} de ${output.code} - ${output.name} / lote ${item.batch.code}${originExpiry} / ${distribution.destinationLocation.name}.`
    )).concat(`Devolver o total de ${item.quantity} ${historicalProduct.defaultUnit} para Revisar (${product}).`);
  });
}
