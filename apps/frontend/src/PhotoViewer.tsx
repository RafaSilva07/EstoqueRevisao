import { PointerEvent, WheelEvent, useRef, useState } from 'react';
import { Modal } from './components';
import { clampPhotoZoom } from './photo-viewer-state';

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = .5;

export function PhotoViewer({ src, alt, status }: { src: string; alt: string; status?: string }) {
  const [open, setOpen] = useState(false);
  return <div className="shipment-photo">
    <button type="button" className="shipment-photo-trigger" aria-label={`Abrir ${alt} para ampliar`} onClick={() => setOpen(true)}>
      <img src={src} alt={alt} />
      <span aria-hidden="true">Ampliar foto</span>
    </button>
    {status && <span className="shipment-photo-status">{status}</span>}
    {open && <PhotoViewerModal src={src} alt={alt} onClose={() => setOpen(false)} />}
  </div>;
}

function PhotoViewerModal({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ pointerId: number; x: number; y: number; originX: number; originY: number } | null>(null);

  function changeZoom(next: number) {
    const value = clampPhotoZoom(next);
    setZoom(value);
    if (value === 1) setOffset({ x: 0, y: 0 });
  }
  function reset() { setZoom(1); setOffset({ x: 0, y: 0 }); }
  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (zoom === 1) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: offset.x, originY: offset.y };
  }
  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    setOffset({ x: current.originX + event.clientX - current.x, y: current.originY + event.clientY - current.y });
  }
  function stopDrag(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  }
  function wheelZoom(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    changeZoom(zoom + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
  }

  return <Modal className="photo-viewer-dialog" labelledBy="photo-viewer-title" onClose={onClose}>
    <div className="photo-viewer-heading">
      <div><p className="eyebrow">Evidência do item</p><h2 id="photo-viewer-title">Visualizar foto</h2></div>
      <button type="button" className="secondary" onClick={onClose}>Fechar</button>
    </div>
    <div className="photo-viewer-controls" aria-label="Controles de ampliação">
      <button type="button" className="secondary" aria-label="Diminuir zoom" disabled={zoom <= MIN_ZOOM} onClick={() => changeZoom(zoom - ZOOM_STEP)}>−</button>
      <output aria-live="polite">{Math.round(zoom * 100)}%</output>
      <button type="button" className="secondary" aria-label="Aumentar zoom" disabled={zoom >= MAX_ZOOM} onClick={() => changeZoom(zoom + ZOOM_STEP)}>+</button>
      <button type="button" className="secondary photo-viewer-reset" disabled={zoom === 1 && offset.x === 0 && offset.y === 0} onClick={reset}>Restaurar</button>
    </div>
    <div className={`photo-viewer-viewport${zoom > 1 ? ' is-zoomed' : ''}`} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={stopDrag} onPointerCancel={stopDrag}
      onWheel={wheelZoom} onDoubleClick={() => changeZoom(zoom === 1 ? 2 : 1)}>
      <img src={src} alt={alt} draggable={false} style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${zoom})` }} />
    </div>
    <p className="photo-viewer-help">Use +/− ou a roda do mouse para ampliar. Com zoom, arraste a foto para examinar outras áreas.</p>
  </Modal>;
}
