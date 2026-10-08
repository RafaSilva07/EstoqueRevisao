import { useEffect, useState } from 'react';
import { api } from './api';
import { formatDate } from './format';
import { MovementEvidence } from './MovementEvidence';
import { PhotoViewer } from './PhotoViewer';
import { Shipment } from './shipments';
import { ReviewEntryAction } from './ReviewEntryAction';

export function ShipmentPhoto({ shipmentId, itemId, productName, available, additionalPhotos = [] }: { shipmentId: string; itemId: string; productName: string; available: boolean; additionalPhotos?: Array<{ ordinal: number; mimeType: string; size: number }> }) {
  const ordinals = [...(available ? [1] : []), ...additionalPhotos.map((photo) => photo.ordinal)].sort((a, b) => a - b);
  if (!ordinals.length) return <span className="muted">Item histórico sem foto.</span>;
  return <div className="shipment-photo-grid">{ordinals.map((ordinal) => <ShipmentPhotoThumbnail key={ordinal} shipmentId={shipmentId} itemId={itemId}
    productName={productName} ordinal={ordinal} total={ordinals.length} />)}</div>;
}

function ShipmentPhotoThumbnail({ shipmentId, itemId, productName, ordinal, total }: { shipmentId: string; itemId: string; productName: string; ordinal: number; total: number }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true; let objectUrl = '';
    const path = ordinal === 1 ? `/shipments/${shipmentId}/items/${itemId}/photo` : `/shipments/${shipmentId}/items/${itemId}/photos/${ordinal}`;
    void api.getBlob(path).then((blob) => {
      if (!active) return; objectUrl = URL.createObjectURL(blob); setUrl(objectUrl);
    }).catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : 'Não foi possível carregar a foto.'); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [itemId, ordinal, shipmentId]);
  if (error) return <span className="photo-required">{error}</span>;
  if (!url) return <span className="muted">Carregando foto…</span>;
  return <PhotoViewer src={url} alt={`Foto ${ordinal} de ${productName}`} status={`Foto ${ordinal} de ${total} · toque para ampliar`} />;
}

export function ShipmentItems({ shipment, onSelectRecord, collapsePhotos = false }: { shipment: Shipment; onSelectRecord?: (id: string) => void; collapsePhotos?: boolean }) {
  return <ul className="movement-detail-items movement-product-list shipment-items">{shipment.items.map((item) => {
    const product = item.assembly?.packageProductSnapshot ?? item.productSnapshot;
    const hasPhotos = Boolean(item.photoMimeType || item.additionalPhotos?.length);
    return <li className="shipment-item-card" key={item.id}>
      {item.codigoRegistro && (onSelectRecord ? <button type="button" className="text-button" onClick={() => onSelectRecord(item.id)}>{item.codigoRegistro} · Ver registro</button> : <small>Registro {item.codigoRegistro}</small>)}
      <div className="movement-product-heading"><strong>{product.code} — {product.name}</strong><b>{item.assembly?.packageQuantity ?? item.quantity} {product.defaultUnit}</b></div>
      <div className="shipment-item-data"><span>{item.assembly?.mixedDates ? 'Lote 0 · datas misturadas' : `Lote ${item.assembly?.outputLot ?? item.batch.code} · fabricação ${formatDate(item.assembly?.outputManufacturingDate ?? item.batch.manufacturingDate)} · validade ${formatDate(item.assembly?.outputExpirationDate ?? item.batch.expirationDate)}`}</span>
        {item.assembly ? <span>Montagem de {item.quantity} UN ({item.productSnapshot.code}). Origens: {item.assembly.sources.map((source) => `${source.locationName} / ${source.lot}: ${source.quantity} UN`).join('; ')}</span>
          : item.stockLocation && <span>Origem da posição: {item.stockLocation.name}</span>}
        {item.observation && <span><strong>Observação do produto:</strong> {item.observation}</span>}
      </div>
      <ReviewEntryAction productId={item.productId} batchId={item.batchId} eligible={shipment.status === 'CONFIRMADO' && shipment.destinationSector === 'REVISAO' && Boolean(shipment.movements?.some((movement) => movement.items?.some((entry) => entry.shipmentItemId === item.id && Number(entry.quantity) > 0)))} />
      {hasPhotos ? <MovementEvidence initiallyCollapsed={collapsePhotos}><ShipmentPhoto shipmentId={shipment.id} itemId={item.id} productName={product.name} available={Boolean(item.photoMimeType)} additionalPhotos={item.additionalPhotos} /></MovementEvidence>
        : <small className="muted">Item histórico sem foto.</small>}
    </li>;
  })}</ul>;
}
