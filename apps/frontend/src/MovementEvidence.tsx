import { ReactNode, useState } from 'react';

export function MovementEvidence({ pendingPcp, children }: { pendingPcp: boolean; children: ReactNode }) {
  const [visible, setVisible] = useState(!pendingPcp);

  return <div className="movement-item-evidence">
    {pendingPcp ? <button type="button" className="secondary" aria-expanded={visible} onClick={() => setVisible((current) => !current)}>{visible ? 'Ocultar fotos' : 'Mostrar fotos'}</button> : <span className="movement-item-evidence-label">Fotos/evidências</span>}
    {visible && children}
  </div>;
}
