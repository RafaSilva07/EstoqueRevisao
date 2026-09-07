import { Movement } from './api';

export function movementCancellationImpact(movement: Movement): string[] {
  return movement.items.flatMap((item) => {
    const product = `${item.product.code} - ${item.product.name}`;
    if (movement.type === 'ENTRADA_EXTERNA') {
      return [`Retirar ${item.quantity} ${item.product.defaultUnit} de ${product} / lote ${item.batch.code} / ${movement.destinationLocation?.name}.`];
    }
    if (movement.type === 'SAIDA_EXTERNA') {
      return [`Devolver ${item.quantity} ${item.product.defaultUnit} para ${product} / lote ${item.batch.code} / ${movement.originLocation.name}.`];
    }
    if (movement.type === 'TRANSFERENCIA_INTERNA') {
      return [`Retirar ${item.quantity} ${item.product.defaultUnit} de ${product} / lote ${item.destinationBatch?.code} / ${movement.destinationLocation?.name} e devolver ao lote ${item.batch.code} / ${movement.originLocation.name}.`];
    }
    return item.distributions.map((distribution) => (
      `Retirar ${distribution.quantity} ${item.product.defaultUnit} de ${product} / lote ${item.batch.code} / ${distribution.destinationLocation.name}.`
    )).concat(`Devolver o total de ${item.quantity} ${item.product.defaultUnit} para Revisar.`);
  });
}
