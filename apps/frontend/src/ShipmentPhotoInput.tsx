import { useRef, useState } from 'react';
import { ShipmentPhotoLimits } from './api';
import { CameraModal } from './CameraModal';
import { PhotoViewer } from './PhotoViewer';
import { PhotoAttachment } from './shipment-photo-state';

const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];

export function ShipmentPhotoInput({ photos, limits, productName, remainingTotal, onAdd, onRemove, readOnly = false }: {
  photos: PhotoAttachment[];
  limits: ShipmentPhotoLimits;
  productName: string;
  remainingTotal: number;
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
  readOnly?: boolean;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [error, setError] = useState('');
  const available = Math.min(limits.maximum - photos.length, remainingTotal);

  function add(files: File[]) {
    if (files.length > available) { setError(`É possível adicionar mais ${available} foto(s) a este produto.`); return; }
    if (files.some((file) => !allowedTypes.includes(file.type) || file.size < 1 || file.size > 5 * 1024 * 1024)) {
      setError('Use fotos JPEG, PNG ou WebP com até 5 MB cada.'); return;
    }
    setError(''); onAdd(files);
  }

  return <div className="shipment-photo-input">
    <span>{photos.length} foto(s) · mínimo {limits.minimum}, máximo {limits.maximum} por produto</span>
    {photos.length > 0 && <div className="shipment-photo-grid">{photos.map((photo, index) => <div className="shipment-photo-entry" key={photo.url}>
      <PhotoViewer src={photo.url} alt={`Foto ${index + 1} de ${productName}`} status={`Foto ${index + 1} de ${photos.length}`} />
      {!readOnly && <button type="button" className="secondary" onClick={() => onRemove(index)} aria-label={`Remover foto ${index + 1} de ${productName}`}>Remover foto</button>}
    </div>)}</div>}
    {!readOnly && <div className="row-actions">
      <button type="button" disabled={available <= 0} onClick={() => setCameraOpen(true)}>Tirar foto</button>
      <button type="button" className="secondary" disabled={available <= 0} onClick={() => picker.current?.click()}>Escolher fotos</button>
      <input ref={picker} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(event) => { add(Array.from(event.target.files ?? [])); event.target.value = ''; }} />
    </div>}
    {error && <span className="photo-required" role="alert">{error}</span>}
    {cameraOpen && <CameraModal onClose={() => setCameraOpen(false)} onUse={(file) => { add([file]); setCameraOpen(false); }} />}
  </div>;
}
