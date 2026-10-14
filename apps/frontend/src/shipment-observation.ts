interface ShipmentObservationReference {
  id?: string | null;
  codigoMovimentacao?: string | null;
  sourceShipmentId?: string | null;
  sourceShipment?: { id: string; codigoMovimentacao: string } | null;
}

export function formatShipmentObservation(
  observation: string | null, shipment?: ShipmentObservationReference | null, fallbackCode?: string | null,
): string | null {
  if (!observation || !shipment) return observation;
  // Only recognize complete system messages and references belonging to this shipment.
  const automatic = /^Retorno imediato do recebimento ([0-9a-f-]{36})\.$/i.exec(observation)
    ?? /^Envio ([0-9a-f-]{36}) confirmado pelo destinatário\.$/i.exec(observation);
  if (!automatic) return observation;
  const references = [
    { id: shipment.id, code: shipment.codigoMovimentacao ?? fallbackCode },
    { id: shipment.sourceShipment?.id ?? shipment.sourceShipmentId, code: shipment.sourceShipment?.codigoMovimentacao },
  ];
  const reference = references.find((item) => item.id?.toLowerCase() === automatic[1].toLowerCase());
  return reference?.code ? observation.replace(automatic[1], reference.code) : observation;
}
