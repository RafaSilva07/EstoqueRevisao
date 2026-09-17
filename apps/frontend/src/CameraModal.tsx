import { useEffect, useRef, useState } from 'react';
import { Modal, Notice } from './components';
import { stopMediaStream } from './camera-utils';

const MAX_SIDE = 1600;

export function CameraModal({ onUse, onClose }: { onUse: (file: File) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [error, setError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [cameraVersion, setCameraVersion] = useState(0);
  useEffect(() => {
    let active = true;
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) { setError('Este navegador não oferece acesso à câmera. Use um navegador atualizado em HTTPS.'); return; }
      try {
        const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (!active) { stopMediaStream(media); return; }
        stream.current = media;
        if (video.current) { video.current.srcObject = media; await video.current.play(); }
      } catch { if (active) setError('Não foi possível acessar a câmera. Verifique a permissão do navegador e tente novamente.'); }
    }
    void start();
    return () => { active = false; stopMediaStream(stream.current); };
  }, [cameraVersion]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function capture() {
    const source = video.current;
    if (!source?.videoWidth || !source.videoHeight) { setError('A câmera ainda está preparando a imagem. Tente novamente.'); return; }
    const scale = Math.min(1, MAX_SIDE / Math.max(source.videoWidth, source.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(source.videoWidth * scale); canvas.height = Math.round(source.videoHeight * scale);
    canvas.getContext('2d')?.drawImage(source, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) { setError('Não foi possível capturar a imagem.'); return; }
      const captured = new File([blob], `foto-${crypto.randomUUID()}.jpg`, { type: 'image/jpeg' });
      setFile(captured); setPreview(URL.createObjectURL(captured)); setError('');
      stopMediaStream(stream.current); stream.current = null;
    }, 'image/jpeg', .82);
  }
  function retake() { setFile(null); setPreview(''); setError(''); setCameraVersion((value) => value + 1); }

  return <Modal labelledBy="camera-title" onClose={onClose}>
    <h2 id="camera-title">Foto do produto</h2>
    <p>Enquadre o produto e o lote de forma legível.</p>
    {error && <Notice kind="error">{error}</Notice>}
    {!file && <video ref={video} className="camera-preview" playsInline muted aria-label="Visualização ao vivo da câmera" />}
    {preview && <img className="camera-preview" src={preview} alt="Foto capturada para conferência" />}
    <div className="dialog-actions">
      <button type="button" className="secondary" onClick={onClose}>Cancelar</button>
      {!file ? <button type="button" disabled={Boolean(error)} onClick={capture}>Capturar</button> : <>
        <button type="button" className="secondary" onClick={retake}>Refazer</button>
        <button type="button" onClick={() => onUse(file)}>Usar foto</button>
      </>}
    </div>
  </Modal>;
}
