import { useEffect, useRef, useState } from 'react';
import { api, ShipmentPhotoLimits } from './api';
import { LoadingState, Modal, Notice } from './components';
import { DraftActions } from './FormDrafts';
import { formatDate, formatDateTime } from './format';
import { PhotoAttachment } from './shipment-photo-state';
import { ShipmentPhotoInput } from './ShipmentPhotoInput';
import { Shipment } from './shipments';
import { useFormDraft } from './useFormDraft';

export interface SeparationDialogProps {
  shipment: Shipment;
  onClose: () => void;
  onDone: () => void;
}

export function SeparationDialog({ shipment, onClose, onDone }: SeparationDialogProps) {
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(shipment.items.map((item) => [item.id, String(item.separationDraft?.returnQuantity ?? 0)]))
  );
  const [photos, setPhotos] = useState<Record<string, PhotoAttachment[]>>({});
  const [photoLimits, setPhotoLimits] = useState<ShipmentPhotoLimits | null>(null);
  const photoUrls = useRef(new Set<string>());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const draft = useFormDraft(
    `separation:${shipment.id}`,
    'Separação imediata',
    { quantities, photos },
    (savedData) => {
      setQuantities(savedData.quantities);
      setPhotos(savedData.photos);
    },
    { busy }
  );

  const close = () => draft.close(onClose);

  useEffect(() => {
    let active = true;
    const urls = photoUrls.current;
    void api.get<ShipmentPhotoLimits>('/settings/shipment-photos')
      .then((limits) => {
        if (active) setPhotoLimits(limits);
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : 'Não foi possível carregar os limites de fotos.');
      });

    return () => {
      active = false;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const payload = (includePhotos = false) => ({
    items: shipment.items.map((item) => ({
      shipmentItemId: item.id,
      returnQuantity: Number(quantities[item.id] || 0),
      ...(includePhotos && Number(quantities[item.id] || 0) > 0 ? { photoCount: photos[item.id]?.length ?? 0 } : {})
    }))
  });

  const valid = shipment.items.every(
    (item) => Number.isSafeInteger(Number(quantities[item.id])) && Number(quantities[item.id]) >= 0 && Number(quantities[item.id]) <= item.quantity
  );

  const photoTotal = shipment.items.reduce(
    (sum, item) => sum + (Number(quantities[item.id] || 0) > 0 ? photos[item.id]?.length ?? 0 : 0),
    0
  );

  const photosReady =
    Boolean(photoLimits) &&
    photoTotal <= 100 &&
    shipment.items.every(
      (item) =>
        Number(quantities[item.id] || 0) === 0 ||
        ((photos[item.id]?.length ?? 0) >= photoLimits!.minimum && (photos[item.id]?.length ?? 0) <= photoLimits!.maximum)
    );

  function addPhotos(itemId: string, files: File[]) {
    const added = files.map((file) => ({ file, url: URL.createObjectURL(file) }));
    added.forEach((photo) => photoUrls.current.add(photo.url));
    setPhotos((current) => ({ ...current, [itemId]: [...(current[itemId] ?? []), ...added] }));
  }

  function removePhoto(itemId: string, index: number) {
    setPhotos((current) => {
      const existing = current[itemId] ?? [];
      const removed = existing[index];
      if (removed) {
        URL.revokeObjectURL(removed.url);
        photoUrls.current.delete(removed.url);
      }
      return { ...current, [itemId]: existing.filter((_, photoIndex) => photoIndex !== index) };
    });
  }

  async function save() {
    setBusy(true);
    setError('');
    try {
      await api.patch(`/shipments/${shipment.id}/separation-draft`, payload());
      await draft.save();
      setSaved(true);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível salvar o rascunho.');
    } finally {
      setBusy(false);
    }
  }

  async function complete() {
    if (!valid || !photosReady) return;
    setBusy(true);
    setError('');
    try {
      const orderedFiles = shipment.items
        .filter((item) => Number(quantities[item.id] || 0) > 0)
        .flatMap((item) => (photos[item.id] ?? []).map((photo) => photo.file));

      await api.postMultipart(`/shipments/${shipment.id}/separation-completion`, payload(true), orderedFiles);
      await draft.complete();
      onDone();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível concluir a separação.');
    } finally {
      setBusy(false);
    }
  }

  if (!draft.ready) {
    return (
      <Modal labelledBy="separation-title" busy onClose={close}>
        <h2 id="separation-title">Recuperando rascunho</h2>
        <LoadingState label="Preparando preenchimento" />
      </Modal>
    );
  }

  return (
    <Modal labelledBy="separation-title" className="separation-dialog" busy={busy || !draft.ready} onClose={close}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Recebimento {shipment.codigoMovimentacao}</p>
          <h2 id="separation-title">Finalizar separação</h2>
        </div>
        <button type="button" className="secondary" disabled={busy} onClick={close}>
          Continuar depois
        </button>
      </div>

      <p>Informe somente o que retornará à Expedição. O restante entrará diretamente no estoque da Revisão.</p>
      <p className="muted">
        Para retomar depois, use <strong>Separações para finalizar</strong> no Início ou a aba <strong>Separações em andamento</strong> em Recebimentos. O prazo continua correndo.
      </p>

      <DraftActions draft={draft} />

      {shipment.separationExpiresAt && (
        <Notice kind="info">Concluir até {formatDateTime(shipment.separationExpiresAt)}.</Notice>
      )}

      {error && <Notice kind="error">{error}</Notice>}
      {saved && <Notice kind="success">Rascunho salvo. O prazo continua correndo.</Notice>}

      {!photoLimits && <p className="muted">Carregando os limites de fotos…</p>}

      <div className="separation-items">
        {shipment.items.map((item) => {
          const amount = Number(quantities[item.id] || 0);
          return (
            <article className="shipment-item-card" key={item.id}>
              <div className="shipment-item-heading">
                <strong>
                  {item.productSnapshot.code} — {item.productSnapshot.name}
                </strong>
                <b>Recebido: {item.quantity}</b>
              </div>
              <p>
                Lote {item.batch.code} · {formatDate(item.batch.manufacturingDate)}
              </p>
              <label>
                Quantidade de retorno
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max={item.quantity}
                  step="1"
                  value={quantities[item.id] ?? '0'}
                  onChange={(event) => {
                    setQuantities((current) => ({ ...current, [item.id]: event.target.value }));
                    setSaved(false);
                  }}
                />
              </label>
              {amount > 0 && photoLimits && (
                <ShipmentPhotoInput
                  photos={photos[item.id] ?? []}
                  limits={photoLimits}
                  productName={item.productSnapshot.name}
                  remainingTotal={100 - photoTotal}
                  onAdd={(files) => addPhotos(item.id, files)}
                  onRemove={(index) => removePhoto(item.id, index)}
                />
              )}
            </article>
          );
        })}
      </div>

      <div className="dialog-actions">
        <button type="button" className="secondary" onClick={() => void save()} disabled={busy || !valid}>
          Salvar e sair
        </button>
        <button type="button" onClick={() => void complete()} disabled={busy || !valid || !photosReady}>
          Concluir separação
        </button>
      </div>
    </Modal>
  );
}
